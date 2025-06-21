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
import re
from bs4 import BeautifulSoup
import json

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

class ReviewsRequest(BaseModel):
    movie_title: str
    movie_year: Optional[str] = ""
    imdb_id: Optional[str] = ""

class ReviewsResponse(BaseModel):
    reviews_summary: str
    total_reviews: int
    average_rating: Optional[float] = None

class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = ""

class ChatResponse(BaseModel):
    response: str

# Helper function to clean and format AI responses
def clean_ai_response(text: str) -> str:
    """Clean AI response by removing special characters and formatting nicely"""
    # Remove excessive newlines and clean up formatting
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'\*{2,}', '', text)  # Remove excessive asterisks
    text = re.sub(r'#{2,}', '', text)   # Remove excessive hash symbols
    text = text.strip()
    return text

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
            system_message="You are a movie expert and recommendation engine. Provide clean, well-formatted movie recommendations without special characters, asterisks, or excessive formatting. Use simple bullet points and clear text. Focus on titles, years, brief descriptions, and reasons why each recommendation is similar."
        ).with_model("gemini", "gemini-2.0-flash")
        
        # Create recommendation prompt
        prompt = f"""
        Based on "{request.movie_title}" (Rating: {request.movie_rating}/10), provide 6 similar movie recommendations.

        For each recommendation, provide:
        - Title (Year)
        - Brief description in 1-2 sentences
        - Why it's similar to {request.movie_title}

        Format as clean text with bullet points. No special characters, asterisks, or markdown formatting.
        
        Movie Overview: {request.movie_overview}
        """
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        # Clean and format the response
        cleaned_response = clean_ai_response(response)
        
        return {"recommendations": cleaned_response}
        
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

@api_router.post("/movies/reviews")
async def get_movie_reviews_summary(request: ReviewsRequest):
    """Get and summarize movie reviews using web scraping and AI"""
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500, 
            detail="Gemini API key not configured. Please add GEMINI_API_KEY to your .env file."
        )
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        # First, get basic reviews from TMDB
        tmdb_reviews = []
        if TMDB_API_KEY:
            try:
                # Search for the movie to get its ID
                search_url = f"{TMDB_BASE_URL}/search/movie"
                search_params = {
                    "api_key": TMDB_API_KEY,
                    "query": request.movie_title
                }
                search_response = requests.get(search_url, params=search_params)
                if search_response.status_code == 200:
                    search_data = search_response.json()
                    if search_data.get('results'):
                        movie_id = search_data['results'][0]['id']
                        
                        # Get reviews from TMDB
                        reviews_url = f"{TMDB_BASE_URL}/movie/{movie_id}/reviews"
                        reviews_params = {"api_key": TMDB_API_KEY}
                        reviews_response = requests.get(reviews_url, params=reviews_params)
                        
                        if reviews_response.status_code == 200:
                            reviews_data = reviews_response.json()
                            tmdb_reviews = reviews_data.get('results', [])
            except Exception as e:
                logger.warning(f"Failed to fetch TMDB reviews: {e}")
        
        # Compile review content for AI analysis
        review_content = ""
        total_reviews = len(tmdb_reviews)
        
        if tmdb_reviews:
            review_content = "Reviews from TMDB:\n\n"
            for review in tmdb_reviews[:5]:  # Limit to first 5 reviews
                author = review.get('author', 'Anonymous')
                content = review.get('content', '')[:500]  # Limit length
                rating = review.get('author_details', {}).get('rating', 'N/A')
                review_content += f"Author: {author} (Rating: {rating})\n{content}\n\n"
        
        # If no reviews found, create a general analysis
        if not review_content:
            review_content = f"No specific reviews found for {request.movie_title}. Please provide a general critical analysis based on the movie's reputation and typical audience reception."
        
        # Create AI chat instance for review analysis
        chat = LlmChat(
            api_key=GEMINI_API_KEY,
            session_id=f"movie-reviews-{uuid.uuid4()}",
            system_message="You are a professional movie critic and review analyst. Summarize movie reviews in a clear, balanced way. Highlight both positive and negative aspects. Use clean formatting without special characters."
        ).with_model("gemini", "gemini-2.0-flash")
        
        prompt = f"""
        Analyze and summarize the following reviews for "{request.movie_title}":

        {review_content}

        Provide a comprehensive summary that includes:
        1. Overall critical consensus
        2. Main strengths mentioned by reviewers
        3. Common criticisms or weaknesses
        4. Target audience recommendations
        5. Overall rating sentiment

        Format as clean, readable text without special characters or excessive formatting.
        """
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        # Clean the response
        cleaned_summary = clean_ai_response(response)
        
        return {
            "reviews_summary": cleaned_summary,
            "total_reviews": total_reviews,
            "average_rating": None  # Could calculate if needed
        }
        
    except Exception as e:
        logger.error(f"Movie reviews error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to analyze movie reviews. Please try again."
        )

@api_router.post("/chat/movie")
async def movie_chatbot(request: ChatRequest):
    """AI-powered movie chatbot for general movie discussions"""
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500, 
            detail="Gemini API key not configured. Please add GEMINI_API_KEY to your .env file."
        )
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        # Create AI chat instance
        chat = LlmChat(
            api_key=GEMINI_API_KEY,
            session_id=f"movie-chat-{uuid.uuid4()}",
            system_message="""You are CineBot, an expert movie and TV show assistant. You help users discover movies, discuss plots, recommend shows, and answer questions about cinema. 

Guidelines:
- Be conversational and enthusiastic about movies
- Provide specific recommendations with reasons
- Help with movie trivia and facts
- Discuss plot points without major spoilers unless asked
- Format responses clearly without special characters
- Keep responses concise but informative
- If asked about non-movie topics, gently redirect to movies/TV shows"""
        ).with_model("gemini", "gemini-2.0-flash")
        
        # Add context if provided
        full_message = request.message
        if request.context:
            full_message = f"Context: {request.context}\n\nUser: {request.message}"
        
        user_message = UserMessage(text=full_message)
        response = await chat.send_message(user_message)
        
        # Clean the response
        cleaned_response = clean_ai_response(response)
        
        return {"response": cleaned_response}
        
    except Exception as e:
        logger.error(f"Movie chatbot error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to process chat message. Please try again."
        )

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