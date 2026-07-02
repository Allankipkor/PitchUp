import uuid
import datetime as dt_module
from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from database import Base

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    created_at = Column(DateTime, default=dt_module.datetime.utcnow)

    # Relationships
    organized_games = relationship("Game", back_populates="organizer")
    participations = relationship("Participant", back_populates="user")
    comments = relationship("Comment", back_populates="user")
    owned_clubs = relationship("Club", back_populates="owner")
    notifications = relationship("Notification", back_populates="recipient")


class Game(Base):
    __tablename__ = "games"

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    address = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    datetime = Column(DateTime, nullable=False)  # Kickoff date and time
    format = Column(String, nullable=False)      # '5-a-side', '7-a-side', '11-a-side'
    skill_level = Column(String, nullable=False)  # 'casual', 'competitive'
    spots_total = Column(Integer, nullable=False)
    cost = Column(Float, nullable=True)          # Cost per player
    organizer_id = Column(String, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="open")       # 'open', 'cancelled'
    repeats_weekly = Column(Boolean, default=False)
    last_recurring_run = Column(DateTime, default=dt_module.datetime.utcnow)
    created_at = Column(DateTime, default=dt_module.datetime.utcnow)

    # Relationships
    organizer = relationship("User", back_populates="organized_games")
    participants = relationship("Participant", back_populates="game", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="game", cascade="all, delete-orphan")


class Participant(Base):
    __tablename__ = "participants"

    id = Column(String, primary_key=True, default=generate_uuid)
    game_id = Column(String, ForeignKey("games.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="joined")     # 'joined', 'waitlisted'
    joined_at = Column(DateTime, default=dt_module.datetime.utcnow)
    showed_up = Column(Boolean, nullable=True)    # Attendance tracker: None/True/False

    # Relationships
    game = relationship("Game", back_populates="participants")
    user = relationship("User", back_populates="participations")


class Comment(Base):
    __tablename__ = "comments"

    id = Column(String, primary_key=True, default=generate_uuid)
    game_id = Column(String, ForeignKey("games.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    text = Column(String, nullable=False)
    created_at = Column(DateTime, default=dt_module.datetime.utcnow)

    # Relationships
    game = relationship("Game", back_populates="comments")
    user = relationship("User", back_populates="comments")


class Club(Base):
    __tablename__ = "clubs"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    address = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    contact_email = Column(String, nullable=False)
    contact_phone = Column(String, nullable=True)
    looking_for = Column(String, nullable=False)   # Comma-separated or JSON list of positions needed
    description = Column(String, nullable=False)
    status = Column(String, default="recruiting")  # 'recruiting', 'inactive'
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=dt_module.datetime.utcnow)

    # Relationships
    owner = relationship("User", back_populates="owned_clubs")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=generate_uuid)
    recipient_id = Column(String, ForeignKey("users.id"), nullable=False)
    type = Column(String, nullable=False)         # 'joined', 'waitlist_promoted', 'game_cancelled', 'new_comment'
    message = Column(String, nullable=False)
    related_game_id = Column(String, ForeignKey("games.id"), nullable=True)
    read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=dt_module.datetime.utcnow)

    # Relationships
    recipient = relationship("User", back_populates="notifications")
