import os
import logging
from datetime import datetime, timedelta
from typing import Optional
import jwt
from fastapi import Request, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
import models
import resend

# Logging setup
logger = logging.getLogger("pitchup.auth")
logging.basicConfig(level=logging.INFO)

# Configs
JWT_SECRET = os.getenv("JWT_SECRET", "fb8b8f8a846c4f03a6d713c23949f280a9d94b0d091e921e5e01b7a605f6e80b")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
MAGIC_LINK_EXPIRE_MINUTES = 15

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

# Automatically fix common subdomain underscore typos for Vercel and Render hosts
from urllib.parse import urlparse, urlunparse
try:
    parsed = urlparse(FRONTEND_URL)
    if parsed.netloc and ("vercel.app" in parsed.netloc or "onrender.com" in parsed.netloc):
        new_netloc = parsed.netloc.replace("_", "-")
        parsed = parsed._replace(netloc=new_netloc)
        FRONTEND_URL = urlunparse(parsed)
except Exception:
    pass


# Initialize Resend
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

def create_magic_link_token(email: str) -> str:
    """Generate a short-lived JWT token containing email for magic link authentication."""
    expire = datetime.utcnow() + timedelta(minutes=MAGIC_LINK_EXPIRE_MINUTES)
    payload = {
        "sub": email,
        "type": "magic_link",
        "exp": expire
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_magic_link_token(token: str) -> Optional[str]:
    """Verify magic link token and return the email if valid."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") == "magic_link":
            return payload.get("sub")
    except jwt.PyJWTError:
        pass
    return None

def create_session_token(user_id: str) -> str:
    """Generate a long-lived JWT token for the user session."""
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "type": "session",
        "exp": expire
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def send_magic_link_email(email: str, token: str):
    """Sends magic link via Resend or logs to console if no API key is present."""
    magic_link = f"{FRONTEND_URL}/verify?token={token}"
    
    if not RESEND_API_KEY:
        print("\n" + "="*80)
        print("  LOCAL DEVELOPMENT MAGIC LINK")
        print("  Email: ", email)
        print("  Link:  ", magic_link)
        print("="*80 + "\n")
        logger.info(f"Magic link generated for {email} (logged to console)")
        return True
        
    try:
        params = {
            "from": "PitchUp <noreply@game-on-map.preview.emergentagent.com>", # Use emergent.sh default domain or generic
            "to": [email],
            "subject": "Sign in to PitchUp",
            "html": f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                    <h2 style="color: #111; font-family: 'Oswald', sans-serif;">Welcome to PitchUp ⚽</h2>
                    <p>Click the button below to sign in to your PitchUp account. This link will expire in 15 minutes.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{magic_link}" style="background-color: #bfff00; color: #000; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px; display: inline-block;">Sign In</a>
                    </div>
                    <p style="color: #666; font-size: 14px;">If the button above does not work, copy and paste this URL into your browser:</p>
                    <p style="color: #888; font-size: 12px; word-break: break-all;">{magic_link}</p>
                </div>
            """
        }
        resend.Emails.send(params)
        logger.info(f"Magic link email sent to {email} via Resend")
        return True
    except Exception as e:
        logger.error(f"Failed to send email via Resend: {str(e)}")
        # Fallback to console in case of API failure so dev doesn't break
        print("\n" + "="*80)
        print("  FALLBACK LOCAL MAGIC LINK (Resend Error)")
        print("  Email: ", email)
        print("  Link:  ", magic_link)
        print("="*80 + "\n")
        return True

def get_current_user(request: Request, db: Session = Depends(get_db)) -> models.User:
    """Dependency that extracts the JWT token from cookies and resolves the User."""
    token = request.cookies.get("session_token")
    
    # Also support authorization header for API debugging
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated - session token missing",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        if not user_id or token_type != "session":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token session",
            )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired",
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
        
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
        
    return user

def get_optional_current_user(request: Request, db: Session = Depends(get_db)) -> Optional[models.User]:
    """Dependency that returns the current User if authenticated, else None."""
    try:
        return get_current_user(request, db)
    except HTTPException:
        return None
