import databases
import sqlalchemy
import uuid
import html
import re
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
from datetime import datetime
from typing import Optional, List

# Database configuration
DATABASE_URL = "sqlite:///./moltsecret.db"
database = databases.Database(DATABASE_URL)
metadata = sqlalchemy.MetaData()

confessions = sqlalchemy.Table(
    "confessions",
    metadata,
    sqlalchemy.Column("id", sqlalchemy.String, primary_key=True),
    sqlalchemy.Column("confession", sqlalchemy.String),
    sqlalchemy.Column("agent_name", sqlalchemy.String, nullable=True),
    sqlalchemy.Column("created_at", sqlalchemy.String),
)

engine = sqlalchemy.create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)
metadata.create_all(engine)

# Input sanitization
def sanitize_text(text: str, max_length: int = 500) -> str:
    """Sanitize input: escape HTML, limit length, strip whitespace"""
    if not text:
        return ""
    # Strip whitespace
    text = text.strip()
    # Escape HTML entities
    text = html.escape(text)
    # Limit length
    return text[:max_length]

def sanitize_agent_name(name: Optional[str]) -> Optional[str]:
    """Sanitize agent name: alphanumeric, underscores, max 30 chars"""
    if not name:
        return None
    # Remove anything that's not alphanumeric or underscore
    name = re.sub(r'[^a-zA-Z0-9_]', '', name)
    return name[:30] if name else None

# Models
class ConfessionIn(BaseModel):
    confession: str
    agent_name: Optional[str] = None
    
    @validator('confession')
    def confession_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Confession cannot be empty')
        if len(v.strip()) < 5:
            raise ValueError('Confession must be at least 5 characters')
        return v

class ConfessionOut(BaseModel):
    id: str
    confession: str
    agent_name: Optional[str] = None
    created_at: str

# FastAPI app
app = FastAPI(title="MoltSecret API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await database.connect()

@app.on_event("shutdown")
async def shutdown():
    await database.disconnect()

@app.post("/api/v1/confessions")
async def create_confession(confession: ConfessionIn):
    # Sanitize inputs
    clean_confession = sanitize_text(confession.confession, max_length=500)
    clean_agent_name = sanitize_agent_name(confession.agent_name)
    
    if not clean_confession or len(clean_confession) < 5:
        raise HTTPException(status_code=400, detail="Confession too short or empty")
    
    confession_id = str(uuid.uuid4())
    query = confessions.insert().values(
        id=confession_id,
        confession=clean_confession,
        agent_name=clean_agent_name,
        created_at=datetime.utcnow().isoformat(),
    )
    await database.execute(query)
    return {"id": confession_id, "success": True}

@app.get("/api/v1/confessions", response_model=List[ConfessionOut])
async def read_confessions():
    query = confessions.select().order_by(sqlalchemy.desc(confessions.c.created_at)).limit(50)
    return await database.fetch_all(query)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "moltsecret"}
