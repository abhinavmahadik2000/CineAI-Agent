from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import requests
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# API Keys (will be added to .env file)
TMDB_API_KEY = os.environ.get('TMDB_API_KEY', '')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')

# TMDB API Base URL
TMDB_BASE_URL = "https://api.themoviedb.org/3"

# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

class MovieSearchResponse(BaseModel):
    results: List[dict]
    total_results: int
    total_pages: int

class RecommendationRequest(BaseModel):
    movie_title: str
    movie_overview: Optional[str] = ""
    movie_genre: Optional[List[int]] = []
    movie_rating: Optional[float] = 0.0

class RecommendationResponse(BaseModel):
    recommendations: str

# Existing routes
@api_router.get("/")
async def root():
    return {"message": "CineAI Backend API - Movie & TV Show Discovery Platform"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Movie and TV Show API endpoints
@api_router.get("/movies/search")
async def search_movies(query: str = Query(..., description="Search query for movies and TV shows")):
    """Search for movies and TV shows using TMDB API"""
    if not TMDB_API_KEY:
        raise HTTPException(
            status_code=500, 
            detail="TMDB API key not configured. Please add TMDB_API_KEY to your .env file."
        )
    
    try:
        # Search for movies
        movie_url = f"{TMDB_BASE_URL}/search/movie"
        movie_params = {
            "api_key": TMDB_API_KEY,
            "query": query,
            "include_adult": False,
            "page": 1
        }
        
        # Search for TV shows
        tv_url = f"{TMDB_BASE_URL}/search/tv"
        tv_params = {
            "api_key": TMDB_API_KEY,
            "query": query,
            "include_adult": False,
            "page": 1
        }
        
        # Make both requests
        movie_response = requests.get(movie_url, params=movie_params)
        tv_response = requests.get(tv_url, params=tv_params)
        
        if movie_response.status_code != 200 or tv_response.status_code != 200:
            raise HTTPException(status_code=502, detail="TMDB API error")
        
        movie_data = movie_response.json()
        tv_data = tv_response.json()
        
        # Combine results and add media type
        combined_results = []
        
        for movie in movie_data.get('results', []):
            movie['media_type'] = 'movie'
            combined_results.append(movie)
        
        for tv_show in tv_data.get('results', []):
            tv_show['media_type'] = 'tv'
            combined_results.append(tv_show)
        
        # Sort by popularity (vote_average * vote_count) 
        combined_results.sort(key=lambda x: (x.get('vote_average', 0) * x.get('vote_count', 0)), reverse=True)
        
        return {
            "results": combined_results[:20],  # Limit to top 20 results
            "total_results": len(combined_results),
            "total_pages": 1
        }
        
    except requests.exceptions.RequestException as e:
        logger.error(f"TMDB API request failed: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch data from TMDB API")
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during search")

@api_router.get("/movies/trending")
async def get_trending_movies():
    """Get trending movies from TMDB API"""
    if not TMDB_API_KEY:
        raise HTTPException(
            status_code=500, 
            detail="TMDB API key not configured. Please add TMDB_API_KEY to your .env file."
        )
    
    try:
        url = f"{TMDB_BASE_URL}/trending/movie/day"
        params = {
            "api_key": TMDB_API_KEY
        }
        
        response = requests.get(url, params=params)
        
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="TMDB API error")
        
        data = response.json()
        
        # Add media type to each result
        for movie in data.get('results', []):
            movie['media_type'] = 'movie'
        
        return data
        
    except requests.exceptions.RequestException as e:
        logger.error(f"TMDB API request failed: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch trending movies")
    except Exception as e:
        logger.error(f"Trending movies error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@api_router.post("/movies/recommendations")
async def get_movie_recommendations(request: RecommendationRequest):
    """Get AI-powered movie recommendations using Gemini API"""
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500, 
            detail="Gemini API key not configured. Please add GEMINI_API_KEY to your .env file."
        )
    
    try:
        # Install emergentintegrations if not already installed
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
        except ImportError:
            raise HTTPException(
                status_code=500,
                detail="emergentintegrations library not installed. Please install it using: pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/"
            )
        
        # Create AI chat instance
        chat = LlmChat(
            api_key=GEMINI_API_KEY,
            session_id=f"movie-recommendations-{uuid.uuid4()}",
            system_message="You are an expert movie critic and recommendation engine. You provide detailed, personalized movie and TV show recommendations based on user preferences. Your recommendations should include the title, year, brief description, and why it's similar to or would appeal to someone who liked the given movie. Format your response in a clear, engaging way."
        ).with_model("gemini", "gemini-2.0-flash")
        
        # Create recommendation prompt
        prompt = f"""
        Based on the following movie/TV show, provide 5-7 similar recommendations:
        
        Title: {request.movie_title}
        Overview: {request.movie_overview}
        Rating: {request.movie_rating}/10
        
        Please provide:
        1. Brief analysis of what makes this movie/show appealing
        2. 5-7 similar recommendations with:
           - Title and year
           - Brief description
           - Why it's similar or would appeal to fans
           - Where to watch (if you know)
        
        Format the response in a clear, engaging way that a movie enthusiast would find helpful.
        """
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        return {"recommendations": response}
        
    except Exception as e:
        logger.error(f"AI recommendation error: {e}")
        if "API key" in str(e):
            raise HTTPException(
                status_code=500,
                detail="Invalid Gemini API key. Please check your GEMINI_API_KEY configuration."
            )
        raise HTTPException(
            status_code=500,
            detail="Failed to generate AI recommendations. Please try again."
        )

@api_router.get("/movies/reviews/{movie_id}")
async def get_movie_reviews(movie_id: int):
    """Get movie reviews from TMDB API (placeholder for web scraping)"""
    if not TMDB_API_KEY:
        raise HTTPException(
            status_code=500, 
            detail="TMDB API key not configured. Please add TMDB_API_KEY to your .env file."
        )
    
    try:
        url = f"{TMDB_BASE_URL}/movie/{movie_id}/reviews"
        params = {
            "api_key": TMDB_API_KEY,
            "page": 1
        }
        
        response = requests.get(url, params=params)
        
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="TMDB API error")
        
        return response.json()
        
    except requests.exceptions.RequestException as e:
        logger.error(f"TMDB API request failed: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch movie reviews")
    except Exception as e:
        logger.error(f"Movie reviews error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Log startup message
@app.on_event("startup")
async def startup_event():
    logger.info("CineAI Backend API started successfully")
    logger.info(f"TMDB API Key configured: {'Yes' if TMDB_API_KEY else 'No'}")
    logger.info(f"Gemini API Key configured: {'Yes' if GEMINI_API_KEY else 'No'}")