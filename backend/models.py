from sqlalchemy import Column, Integer, String, JSON, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
import datetime
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./excel_tool.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class FileRecord(Base):
    __tablename__ = "file_records"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    headers = Column(JSON)  # 儲存欄位名稱清單
    rows = Column(JSON)     # 儲存完整的資料列
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    description = Column(Text, nullable=True)

class APIKeyStore(Base):
    __tablename__ = "api_keys"
    
    id = Column(Integer, primary_key=True, index=True)
    service_name = Column(String, unique=True, index=True) # 例如 'gemini'
    encrypted_key = Column(String)
    last_updated = Column(DateTime, default=datetime.datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)
