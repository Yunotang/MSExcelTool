from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
import models
from pydantic import BaseModel
import os
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

# 初始化 Gemini 客戶端
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = None
if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)

app = FastAPI(title="Excel Merge Tool Backend")

# CORS 設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

models.init_db()

def get_db():
    db = models.SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic Schemas
class FileRecordCreate(BaseModel):
    filename: str
    headers: List[str]
    rows: List[dict]
    description: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    history: List[dict]
    data_context: str
    model: str = "gemini-2.0-flash" # 使用最新的 2.0 Flash

# API 路由
@app.get("/")
def read_root():
    return {"status": "ok", "message": "Backend Proxy (New SDK) is active"}

@app.post("/records/")
def create_record(record: FileRecordCreate, db: Session = Depends(get_db)):
    db_record = models.FileRecord(
        filename=record.filename,
        headers=record.headers,
        rows=record.rows,
        description=record.description
    )
    db.add(db_record)
    db.commit()
    db.refresh(db_record)
    return {"id": db_record.id, "status": "saved"}

@app.get("/records/")
def get_records(db: Session = Depends(get_db)):
    records = db.query(models.FileRecord).order_by(models.FileRecord.timestamp.desc()).all()
    return records

@app.post("/chat")
async def chat_with_gemini(req: ChatRequest):
    if not client:
        raise HTTPException(status_code=500, detail="Server Gemini API Key not configured")
    
    try:
        # 將前端傳來的歷史紀錄轉換為新版 SDK 的格式
        contents = []
        for m in req.history:
            role = "user" if m["role"] == "user" else "model"
            contents.append(types.Content(role=role, parts=[types.Part(text=m["text"])]))
        
        # 加入目前的訊息與資料上下文
        prompt = f"資料上下文：\n{req.data_context}\n\n使用者問題：{req.message}"
        contents.append(types.Content(role="user", parts=[types.Part(text=prompt)]))

        # 呼叫 Gemini 2.0+ SDK
        response = client.models.generate_content(
            model=req.model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction="你是一個專業的資料分析助理。請根據使用者提供的資料上下文，以繁體中文回答問題並提供有用的洞察。"
            )
        )
        
        return {"text": response.text}
    except Exception as e:
        print(f"Gemini Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
