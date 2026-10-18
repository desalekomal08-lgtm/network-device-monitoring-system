import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Load environment variables from .env if present (checks backend/.env or root .env)
_backend_dir = Path(__file__).resolve().parent.parent
_env_file = _backend_dir / ".env"
if _env_file.exists():
    load_dotenv(dotenv_path=_env_file)
else:
    load_dotenv()

# Database connection URL:
# 1. Prioritizes the DATABASE_URL environment variable or backend/.env file.
# 2. Falls back to a standard local placeholder if unset.
DEFAULT_DB_URL = "postgresql+psycopg2://postgres:postgres@localhost:5432/network_monitoring_db"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DB_URL)

# Normalize postgresql:// to postgresql+psycopg2:// if psycopg2 is used
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

# Engine manages database connections
engine_kwargs = {}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_kwargs)

# SessionLocal creates a new database session for each request
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for SQLAlchemy ORM models
Base = declarative_base()

# FastAPI dependency to manage database session lifecycle
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
