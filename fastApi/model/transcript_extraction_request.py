from pydantic import BaseModel

class TranscriptExtractionRequest(BaseModel):
    transcript: str