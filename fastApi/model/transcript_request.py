from pydantic import BaseModel
from typing import Optional

class TranscriptionRequest(BaseModel):
    audio_url: str
    language: Optional[str] = "en" # Default chunk size in MB