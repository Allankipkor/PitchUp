from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import List, Optional

# --- Auth Schemas ---
class MagicLinkRequest(BaseModel):
    email: EmailStr

class MagicLinkVerify(BaseModel):
    token: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str

# --- User Schemas ---
class UserBase(BaseModel):
    email: EmailStr
    name: str
    phone: Optional[str] = None

class UserCreate(UserBase):
    pass

class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None

class UserOut(UserBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- Comment Schemas ---
class CommentCreate(BaseModel):
    text: str

class CommentUserOut(BaseModel):
    id: str
    name: str

    class Config:
        from_attributes = True

class CommentOut(BaseModel):
    id: str
    game_id: str
    user_id: str
    user: CommentUserOut
    text: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- Participant Schemas ---
class ParticipantUserOut(BaseModel):
    id: str
    name: str
    # Email and phone are excluded for public privacy
    # They will be populated in organizer-specific schemas or views

    class Config:
        from_attributes = True

class ParticipantOut(BaseModel):
    id: str
    game_id: str
    user_id: str
    user: ParticipantUserOut
    status: str
    joined_at: datetime
    showed_up: Optional[bool] = None

    class Config:
        from_attributes = True

class ParticipantDetailOut(BaseModel):
    id: str
    game_id: str
    user_id: str
    user_name: str
    user_email: str
    user_phone: Optional[str] = None
    status: str
    joined_at: datetime
    showed_up: Optional[bool] = None

    class Config:
        from_attributes = True

class AttendanceUpdate(BaseModel):
    user_id: str
    showed_up: bool

# --- Game Schemas ---
class GameBase(BaseModel):
    title: str
    address: str
    latitude: float
    longitude: float
    datetime: datetime
    format: str
    skill_level: str
    spots_total: int
    cost: Optional[float] = None
    repeats_weekly: bool = False

class GameCreate(GameBase):
    pass

class GameOrganizerOut(BaseModel):
    id: str
    name: str

    class Config:
        from_attributes = True

# Public representation of a game in list/map view
class GameOut(BaseModel):
    id: str
    title: str
    address: str
    latitude: float
    longitude: float
    datetime: datetime
    format: str
    skill_level: str
    spots_total: int
    cost: Optional[float] = None
    status: str
    repeats_weekly: bool
    organizer: GameOrganizerOut
    spots_filled: int
    spots_remaining: int
    created_at: datetime

    class Config:
        from_attributes = True

# Detailed representation of a game
class GameDetailOut(GameOut):
    comments: List[CommentOut] = []
    participants: List[ParticipantOut] = []
    waitlist: List[ParticipantOut] = []

    # Organizer contact info is dynamic and added conditionally in the route
    organizer_email: Optional[str] = None
    organizer_phone: Optional[str] = None

    # Full list of participants with emails/phones, only visible to organizer
    participants_detail: Optional[List[ParticipantDetailOut]] = None

    class Config:
        from_attributes = True

# --- Club Schemas ---
class ClubBase(BaseModel):
    name: str
    address: str
    latitude: float
    longitude: float
    contact_email: EmailStr
    contact_phone: Optional[str] = None
    looking_for: List[str]  # Frontend submits as array, we serialize in backend
    description: str
    status: str = "recruiting"

class ClubCreate(ClubBase):
    pass

class ClubOwnerOut(BaseModel):
    id: str
    name: str

    class Config:
        from_attributes = True

class ClubOut(BaseModel):
    id: str
    name: str
    address: str
    latitude: float
    longitude: float
    contact_email: EmailStr
    contact_phone: Optional[str] = None
    looking_for: List[str]
    description: str
    status: str
    owner: ClubOwnerOut
    created_at: datetime

    class Config:
        from_attributes = True

# --- Notification Schemas ---
class NotificationOut(BaseModel):
    id: str
    recipient_id: str
    type: str
    message: str
    related_game_id: Optional[str] = None
    read: bool
    created_at: datetime

    class Config:
        from_attributes = True
