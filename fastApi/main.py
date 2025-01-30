from fastapi import FastAPI
from dotenv import load_dotenv
from fastApi.routes import openai_route
import os
# from routes import gcp_route, openai_route

# Load environment variables from .env file
load_dotenv()

app = FastAPI()

# app.include_router(gcp_route.router)
app.include_router(openai_route.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to the FastAPI app"}

