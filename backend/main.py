import os
import urllib.parse
from datetime import datetime, timedelta
from typing import List, Optional
import httpx
from fastapi import FastAPI, Depends, HTTPException, status, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func

import models
import schemas
import auth
import scheduler
from database import engine, Base, get_db

# Create DB tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="PitchUp API", version="1.0.0")

FRONTEND_URL_ENV = os.getenv("FRONTEND_URL", "")
allowed_origins = [url.strip().rstrip("/") for url in FRONTEND_URL_ENV.split(",") if url.strip()]

# Always allow local development URL
if "http://localhost:5173" not in allowed_origins:
    allowed_origins.append("http://localhost:5173")

# Allow Capacitor native app origins (Android and iOS)
for native_origin in ["http://localhost", "capacitor://localhost"]:
    if native_origin not in allowed_origins:
        allowed_origins.append(native_origin)

print(f"CORS Allowed Origins: {allowed_origins}")

# CORS Setup - Enable credentials for httpOnly cookies!
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup & Shutdown hooks for scheduler
@app.on_event("startup")
def on_startup():
    scheduler.start_scheduler()

@app.on_event("shutdown")
def on_shutdown():
    scheduler.shutdown_scheduler()

# --- Rate Limiter ---
# Simple in-memory rate-limiter per IP
rate_limit_records = {}

def rate_limit(limit: int, window_seconds: int):
    def dependency(request: Request):
        client_ip = request.client.host if request.client else "unknown"
        now = datetime.utcnow()
        if client_ip not in rate_limit_records:
            rate_limit_records[client_ip] = []
        
        # Keep only timestamps within window
        rate_limit_records[client_ip] = [
            t for t in rate_limit_records[client_ip] 
            if now - t < timedelta(seconds=window_seconds)
        ]
        
        if len(rate_limit_records[client_ip]) >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please try again later."
            )
        rate_limit_records[client_ip].append(now)
    return dependency

# --- Geocoding Cache & Proxy ---
geocode_cache = {}

@app.get("/api/geocode", dependencies=[Depends(rate_limit(limit=10, window_seconds=60))])
async def geocode(q: str):
    """
    Proxies Nominatim geocoding API to prevent public spamming and respect Nominatim fair-use.
    """
    q_stripped = q.strip()
    if not q_stripped:
        raise HTTPException(status_code=400, detail="Query string cannot be empty")
        
    if q_stripped in geocode_cache:
        return geocode_cache[q_stripped]
        
    encoded_q = urllib.parse.quote(q_stripped)
    url = f"https://nominatim.openstreetmap.org/search?q={encoded_q}&format=json&limit=1"
    headers = {"User-Agent": "PitchUp-App/1.0 (contact@pitchup.app)"}
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=10.0)
            if response.status_code == 200:
                data = response.json()
                if data:
                    res = {
                        "address": data[0].get("display_name"),
                        "latitude": float(data[0].get("lat")),
                        "longitude": float(data[0].get("lon"))
                    }
                    # Cache successful lookups
                    geocode_cache[q_stripped] = res
                    return res
                else:
                    raise HTTPException(status_code=444, detail="Location not found")
            else:
                raise HTTPException(status_code=502, detail="Nominatim geocoder error")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Geocoder connection failed: {str(e)}")

# --- Authentication Endpoints ---

@app.post("/api/auth/magic-link")
def request_magic_link(payload: schemas.MagicLinkRequest, db: Session = Depends(get_db)):
    """Issues magic link to user email."""
    # Find or create user
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user:
        # Create a user with a temp name from the email handle
        default_name = payload.email.split("@")[0].capitalize()
        user = models.User(email=payload.email, name=default_name)
        db.add(user)
        db.commit()
        db.refresh(user)
        
    # Generate link
    token = auth.create_magic_link_token(payload.email)
    auth.send_magic_link_email(payload.email, token)
    return {"message": "Magic link sent successfully. Please check your inbox."}

# Resolve cookie security values for cross-domain auth (Vercel to Render)
# Production requires SameSite=None and Secure=True for cross-origin cookies to work
IS_PRODUCTION = any(domain in FRONTEND_URL_ENV for domain in ["vercel.app", "onrender.com"]) or FRONTEND_URL_ENV.startswith("https")
SAMESITE_COOKIE = "none" if IS_PRODUCTION else "lax"
SECURE_COOKIE = True if IS_PRODUCTION else False

@app.post("/api/auth/verify", response_model=schemas.UserOut)
def verify_magic_link(payload: schemas.MagicLinkVerify, response: Response, db: Session = Depends(get_db)):
    """Verifies magic link token and sets session cookie."""
    email = auth.verify_magic_link_token(payload.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired magic link token")
        
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    session_token = auth.create_session_token(user.id)
    
    # Set httpOnly cookie for JWT
    # Secure=True in production, SameSite=None for cross-site cookie usage
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        samesite=SAMESITE_COOKIE,
        secure=SECURE_COOKIE,
        max_age=auth.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )
    
    return user

@app.post("/api/auth/logout")
def logout(response: Response):
    """Clears the session token cookie."""
    response.delete_cookie("session_token", samesite=SAMESITE_COOKIE, secure=SECURE_COOKIE)
    return {"message": "Logged out successfully"}

@app.get("/api/auth/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(auth.get_current_user)):
    """Returns profile for currently logged in user."""
    return current_user

@app.put("/api/auth/me", response_model=schemas.UserOut)
def update_me(payload: schemas.UserUpdate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """Updates user information."""
    if payload.name is not None:
        current_user.name = payload.name
    if payload.phone is not None:
        current_user.phone = payload.phone
    db.commit()
    db.refresh(current_user)
    return current_user


# --- Games Endpoints ---

@app.post("/api/games", response_model=schemas.GameOut, status_code=201, dependencies=[Depends(rate_limit(limit=5, window_seconds=60))])
def create_game(payload: schemas.GameCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """Creates a new game listing."""
    game = models.Game(
        title=payload.title,
        address=payload.address,
        latitude=payload.latitude,
        longitude=payload.longitude,
        datetime=payload.datetime,
        format=payload.format,
        skill_level=payload.skill_level,
        spots_total=payload.spots_total,
        cost=payload.cost,
        organizer_id=current_user.id,
        repeats_weekly=payload.repeats_weekly,
        status="open"
    )
    db.add(game)
    db.commit()
    db.refresh(game)
    
    # Automatically join organizer to the game as first participant
    first_part = models.Participant(
        game_id=game.id,
        user_id=current_user.id,
        status="joined",
        joined_at=datetime.utcnow()
    )
    db.add(first_part)
    db.commit()
    
    # Map additional fields for standard schema mapping
    game.spots_filled = 1
    game.spots_remaining = max(0, game.spots_total - 1)
    
    return game

@app.get("/api/games", response_model=List[schemas.GameOut])
def list_games(
    format: Optional[str] = None,
    skill_level: Optional[str] = None,
    date: Optional[str] = None, # Expects YYYY-MM-DD
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: Optional[float] = 15.0,
    db: Session = Depends(get_db)
):
    """Lists active games with query filters."""
    query = db.query(models.Game).filter(models.Game.status == "open")
    
    if format:
        query = query.filter(models.Game.format == format)
    if skill_level:
        query = query.filter(models.Game.skill_level == skill_level)
    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d").date()
            query = query.filter(func.date(models.Game.datetime) == target_date)
        except ValueError:
            pass
            
    games = query.all()
    results = []
    
    for game in games:
        # Calculate distance if coordinates provided
        if lat is not None and lng is not None:
            # Simple Euclidean distance approximation for local searches (1 degree lat ~ 111km)
            d_lat = game.latitude - lat
            d_lng = game.longitude - lng
            dist = (d_lat**2 + d_lng**2)**0.5 * 111.0
            if dist > radius_km:
                continue
                
        # Count spots
        filled = db.query(models.Participant).filter(
            models.Participant.game_id == game.id,
            models.Participant.status == "joined"
        ).count()
        
        game.spots_filled = filled
        game.spots_remaining = max(0, game.spots_total - filled)
        results.append(game)
        
    return results

@app.get("/api/games/{id}", response_model=schemas.GameDetailOut)
def get_game_detail(id: str, current_user: Optional[models.User] = Depends(auth.get_optional_current_user), db: Session = Depends(get_db)):
    """Retrieves detailed game information, checking organizer identity to toggle privacy screens."""
    game = db.query(models.Game).filter(models.Game.id == id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
        
    # Standard fills counts
    filled = db.query(models.Participant).filter(
        models.Participant.game_id == game.id,
        models.Participant.status == "joined"
    ).count()
    game.spots_filled = filled
    game.spots_remaining = max(0, game.spots_total - filled)
    
    # Load relationships
    game.comments = db.query(models.Comment).filter(models.Comment.game_id == game.id).order_by(models.Comment.created_at.asc()).all()
    
    participants = db.query(models.Participant).filter(
        models.Participant.game_id == game.id,
        models.Participant.status == "joined"
    ).order_by(models.Participant.joined_at.asc()).all()
    
    waitlist = db.query(models.Participant).filter(
        models.Participant.game_id == game.id,
        models.Participant.status == "waitlisted"
    ).order_by(models.Participant.joined_at.asc()).all()
    
    game.participants = participants
    game.waitlist = waitlist
    
    # Identity checking for Organizer Privacy Shield
    is_organizer = current_user is not None and game.organizer_id == current_user.id
    
    if is_organizer:
        # Expose contact details of organizer
        game.organizer_email = game.organizer.email
        game.organizer_phone = game.organizer.phone
        
        # Populate rich participants list showing contact details for coordination
        detailed_participants = []
        for p in (participants + waitlist):
            detailed_participants.append(
                schemas.ParticipantDetailOut(
                    id=p.id,
                    game_id=p.game_id,
                    user_id=p.user_id,
                    user_name=p.user.name,
                    user_email=p.user.email,
                    user_phone=p.user.phone,
                    status=p.status,
                    joined_at=p.joined_at,
                    showed_up=p.showed_up
                )
            )
        game.participants_detail = detailed_participants
    else:
        # Hide contact details
        game.organizer_email = None
        game.organizer_phone = None
        game.participants_detail = None
        
    return game

@app.post("/api/games/{id}/join", response_model=schemas.ParticipantOut)
def join_game(id: str, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """Joins a game. Places user in waitlist if game is full."""
    game = db.query(models.Game).filter(models.Game.id == id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
        
    if game.status == "cancelled":
        raise HTTPException(status_code=400, detail="Cannot join a cancelled game")
        
    # Check if already joined/waitlisted
    already_joined = db.query(models.Participant).filter(
        models.Participant.game_id == id,
        models.Participant.user_id == current_user.id
    ).first()
    if already_joined:
        raise HTTPException(status_code=400, detail="You are already registered for this game")
        
    # Count current joined spots
    filled = db.query(models.Participant).filter(
        models.Participant.game_id == id,
        models.Participant.status == "joined"
    ).count()
    
    status = "joined"
    if filled >= game.spots_total:
        status = "waitlisted"
        
    part = models.Participant(
        game_id=id,
        user_id=current_user.id,
        status=status,
        joined_at=datetime.utcnow()
    )
    db.add(part)
    
    # Notify organizer
    action_text = "joined your game" if status == "joined" else "joined the waitlist for your game"
    notification = models.Notification(
        recipient_id=game.organizer_id,
        type="join",
        message=f"{current_user.name} has {action_text} '{game.title}'.",
        related_game_id=game.id
    )
    db.add(notification)
    db.commit()
    db.refresh(part)
    return part

@app.post("/api/games/{id}/leave")
def leave_game(id: str, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """Leaves a game, promoting waitlisted users if a spot opens up."""
    game = db.query(models.Game).filter(models.Game.id == id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
        
    part = db.query(models.Participant).filter(
        models.Participant.game_id == id,
        models.Participant.user_id == current_user.id
    ).first()
    if not part:
        raise HTTPException(status_code=400, detail="You are not registered for this game")
        
    old_status = part.status
    db.delete(part)
    db.commit()
    
    # If the leaving player was in a filled slot, promote the first waitlisted player
    if old_status == "joined":
        next_waitlisted = db.query(models.Participant).filter(
            models.Participant.game_id == id,
            models.Participant.status == "waitlisted"
        ).order_by(models.Participant.joined_at.asc()).first()
        
        if next_waitlisted:
            next_waitlisted.status = "joined"
            # Notify promoted user
            notification = models.Notification(
                recipient_id=next_waitlisted.user_id,
                type="waitlist_promoted",
                message=f"Good news! You've been promoted from the waitlist for '{game.title}'.",
                related_game_id=game.id
            )
            db.add(notification)
            db.commit()
            
    # Notify organizer
    notification_org = models.Notification(
        recipient_id=game.organizer_id,
        type="leave",
        message=f"{current_user.name} has left your game '{game.title}'.",
        related_game_id=game.id
    )
    db.add(notification_org)
    db.commit()
    return {"message": "You have successfully left the game"}

@app.post("/api/games/{id}/comments", response_model=schemas.CommentOut)
def add_comment(id: str, payload: schemas.CommentCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """Adds a game message coordinate thread."""
    game = db.query(models.Game).filter(models.Game.id == id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
        
    comment = models.Comment(
        game_id=id,
        user_id=current_user.id,
        text=payload.text
    )
    db.add(comment)
    
    # Send a notification to organizer if comment author is not organizer
    if game.organizer_id != current_user.id:
        notification = models.Notification(
            recipient_id=game.organizer_id,
            type="new_comment",
            message=f"{current_user.name} commented on '{game.title}': \"{payload.text[:30]}...\"",
            related_game_id=game.id
        )
        db.add(notification)
        
    db.commit()
    db.refresh(comment)
    return comment

@app.post("/api/games/{id}/cancel")
def cancel_game(id: str, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """Cancels a game. Must be organizer."""
    game = db.query(models.Game).filter(models.Game.id == id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
        
    if game.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can cancel this game")
        
    game.status = "cancelled"
    
    # Notify all participants
    participants = db.query(models.Participant).filter(models.Participant.game_id == id).all()
    for p in participants:
        if p.user_id != current_user.id:
            notification = models.Notification(
                recipient_id=p.user_id,
                type="game_cancelled",
                message=f"Warning: The game '{game.title}' you registered for has been cancelled by the organizer.",
                related_game_id=game.id
            )
            db.add(notification)
            
    db.commit()
    return {"message": "Game cancelled successfully"}

@app.post("/api/games/{id}/attendance")
def record_attendance(id: str, payload: List[schemas.AttendanceUpdate], current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """Organizer marks player attendance (showed_up) after a game datetime has passed."""
    game = db.query(models.Game).filter(models.Game.id == id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
        
    if game.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can record attendance")
        
    if game.datetime > datetime.utcnow():
        raise HTTPException(status_code=400, detail="Cannot log attendance before game has kicked off")
        
    for item in payload:
        part = db.query(models.Participant).filter(
            models.Participant.game_id == id,
            models.Participant.user_id == item.user_id,
            models.Participant.status == "joined"
        ).first()
        if part:
            part.showed_up = item.showed_up
            
    db.commit()
    return {"message": "Attendance logs updated successfully"}


# --- User Profiles & Reliability ---

@app.get("/api/users/{id}/reliability")
def get_user_reliability(id: str, db: Session = Depends(get_db)):
    """Returns public aggregate reliability score for user (shows percentage, hides list)."""
    user = db.query(models.User).filter(models.User.id == id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    total_attended_games = db.query(models.Participant).filter(
        models.Participant.user_id == id,
        models.Participant.showed_up != None
    ).count()
    
    if total_attended_games == 0:
        return {"name": user.name, "score": None, "games_tracked": 0}
        
    showed_up_count = db.query(models.Participant).filter(
        models.Participant.user_id == id,
        models.Participant.showed_up == True
    ).count()
    
    score = int((showed_up_count / total_attended_games) * 100)
    return {"name": user.name, "score": score, "games_tracked": total_attended_games}


# --- Clubs Endpoints ---

@app.post("/api/clubs", response_model=schemas.ClubOut, status_code=201)
def create_club(payload: schemas.ClubCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """Registers a new club in directory."""
    # Convert array of positions to comma separated text
    positions_str = ",".join(payload.looking_for)
    
    club = models.Club(
        name=payload.name,
        address=payload.address,
        latitude=payload.latitude,
        longitude=payload.longitude,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone,
        looking_for=positions_str,
        description=payload.description,
        status=payload.status,
        owner_id=current_user.id
    )
    db.add(club)
    db.commit()
    db.refresh(club)
    
    # Format looking_for back into array
    club.looking_for = payload.looking_for
    return club

@app.get("/api/clubs", response_model=List[schemas.ClubOut])
def list_clubs(db: Session = Depends(get_db)):
    """Lists local clubs."""
    clubs = db.query(models.Club).all()
    for club in clubs:
        # Split string back to array
        club.looking_for = club.looking_for.split(",") if club.looking_for else []
    return clubs

@app.put("/api/clubs/{id}", response_model=schemas.ClubOut)
def update_club(id: str, payload: schemas.ClubCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """Edits club directory details."""
    club = db.query(models.Club).filter(models.Club.id == id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
        
    if club.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the club owner can modify details")
        
    club.name = payload.name
    club.address = payload.address
    club.latitude = payload.latitude
    club.longitude = payload.longitude
    club.contact_email = payload.contact_email
    club.contact_phone = payload.contact_phone
    club.looking_for = ",".join(payload.looking_for)
    club.description = payload.description
    club.status = payload.status
    
    db.commit()
    db.refresh(club)
    club.looking_for = payload.looking_for
    return club


# --- Inbox/Notifications Endpoints ---

@app.get("/api/notifications", response_model=List[schemas.NotificationOut])
def list_notifications(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """Returns notifications for logged in user."""
    return db.query(models.Notification).filter(
        models.Notification.recipient_id == current_user.id
    ).order_by(models.Notification.created_at.desc()).all()

@app.post("/api/notifications/{id}/read")
def mark_notification_read(id: str, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """Marks a user notification as read."""
    notif = db.query(models.Notification).filter(
        models.Notification.id == id,
        models.Notification.recipient_id == current_user.id
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    notif.read = True
    db.commit()
    return {"message": "Notification marked as read"}
