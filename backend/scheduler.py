import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from apscheduler.schedulers.background import BackgroundScheduler
from database import SessionLocal
import models

logger = logging.getLogger("pitchup.scheduler")

def check_and_create_recurring_games():
    """
    Scans the database for active recurring games that are occurring within the next 4 days,
    and automatically creates their copies for the following week.
    """
    logger.info("Running recurring games checker...")
    db: Session = SessionLocal()
    try:
        now = datetime.utcnow()
        # Look for games happening in the next 4 days that repeat weekly and are open
        upcoming_limit = now + timedelta(days=4)
        
        recurring_games = db.query(models.Game).filter(
            models.Game.repeats_weekly == True,
            models.Game.status == "open",
            models.Game.datetime >= now,
            models.Game.datetime <= upcoming_limit
        ).all()
        
        for parent_game in recurring_games:
            next_week_time = parent_game.datetime + timedelta(days=7)
            
            # Check if next week's game already exists
            exists = db.query(models.Game).filter(
                models.Game.title == parent_game.title,
                models.Game.address == parent_game.address,
                models.Game.organizer_id == parent_game.organizer_id,
                models.Game.datetime == next_week_time
            ).first()
            
            if not exists:
                logger.info(f"Auto-creating recurring game '{parent_game.title}' for {next_week_time}")
                
                # Create next week's game
                new_game = models.Game(
                    title=parent_game.title,
                    address=parent_game.address,
                    latitude=parent_game.latitude,
                    longitude=parent_game.longitude,
                    datetime=next_week_time,
                    format=parent_game.format,
                    skill_level=parent_game.skill_level,
                    spots_total=parent_game.spots_total,
                    cost=parent_game.cost,
                    organizer_id=parent_game.organizer_id,
                    status="open",
                    repeats_weekly=True
                )
                db.add(new_game)
                db.flush() # Populate new_game.id
                
                # Notify the organizer
                notification = models.Notification(
                    recipient_id=parent_game.organizer_id,
                    type="system",
                    message=f"Your weekly recurring game '{parent_game.title}' has been scheduled for next week ({next_week_time.strftime('%a %d %b, %H:%M')}).",
                    related_game_id=new_game.id,
                    read=False
                )
                db.add(notification)
                
        db.commit()
        logger.info("Finished running recurring games checker.")
    except Exception as e:
        db.rollback()
        logger.error(f"Error checking recurring games: {str(e)}")
    finally:
        db.close()

# Global scheduler instance
scheduler = BackgroundScheduler()

def start_scheduler():
    if not scheduler.running:
        # Run every 6 hours
        scheduler.add_job(check_and_create_recurring_games, "interval", hours=6, id="recurring_games_job")
        scheduler.start()
        logger.info("APScheduler started successfully.")
        
        # Run immediately on startup to ensure no missed slots
        check_and_create_recurring_games()

def shutdown_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("APScheduler shut down.")
