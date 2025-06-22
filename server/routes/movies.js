const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Movie = require('../models/Movie');
const { optionalAuth, authenticate } = require('../middleware/auth');
const { validateMovieRating } = require('../middleware/validation');

const router = express.Router();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// TMDB API configuration
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = process.env.TMDB_API_KEY;

// Helper function to fetch from TMDB
const fetchFromTMDB = async (endpoint, params = {}) => {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}${endpoint}`, {
      params: {
        api_key: TMDB_API_KEY,
        ...params
      },
      timeout: 10000
    });
    return response.data;
  } catch (error) {
    console.error('TMDB API Error:', error.message);
    throw new Error('Failed to fetch data from TMDB');
  }
};

// Helper function to clean AI responses
const cleanAIResponse = (text) => {
  return text
    .replace(/\*{2,}/g, '')
    .replace(/#{2,}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// Helper function to generate AI content
const generateAIContent = async (prompt, systemInstruction) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('Gemini API key not configured');
    }

    const model = genAI.getGenerativeModel({ 
      model: "gemini-pro",
      systemInstruction
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return cleanAIResponse(response.text());
  } catch (error) {
    console.error('AI Generation Error:', error);
    throw new Error('Failed to generate AI content');
  }
};

// @route   GET /api/movies/search
// @desc    Search movies and TV shows
// @access  Public
router.get('/search', optionalAuth, async (req, res) => {
  try {
    const { query, page = 1 } = req.query;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    // Search movies and TV shows concurrently
    const [movieResults, tvResults] = await Promise.all([
      fetchFromTMDB('/search/movie', { query, page }),
      fetchFromTMDB('/search/tv', { query, page })
    ]);

    // Combine and format results
    const combinedResults = [
      ...movieResults.results.map(movie => ({ ...movie, media_type: 'movie' })),
      ...tvResults.results.map(tv => ({ ...tv, media_type: 'tv' }))
    ];

    // Sort by popularity
    combinedResults.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

    res.json({
      success: true,
      data: {
        results: combinedResults.slice(0, 20),
        total_results: movieResults.total_results + tvResults.total_results,
        total_pages: Math.max(movieResults.total_pages, tvResults.total_pages)
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to search movies'
    });
  }
});

// @route   GET /api/movies/trending
// @desc    Get trending movies
// @access  Public
router.get('/trending', optionalAuth, async (req, res) => {
  try {
    const { timeWindow = 'day', page = 1 } = req.query;
    
    const data = await fetchFromTMDB(`/trending/movie/${timeWindow}`, { page });
    
    // Add media_type to results
    data.results = data.results.map(movie => ({ ...movie, media_type: 'movie' }));

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Trending movies error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch trending movies'
    });
  }
});

// @route   GET /api/movies/popular
// @desc    Get popular movies
// @access  Public
router.get('/popular', optionalAuth, async (req, res) => {
  try {
    const { page = 1 } = req.query;
    
    const data = await fetchFromTMDB('/movie/popular', { page });
    
    data.results = data.results.map(movie => ({ ...movie, media_type: 'movie' }));

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Popular movies error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch popular movies'
    });
  }
});

// @route   GET /api/movies/:id
// @desc    Get movie details
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const movieData = await fetchFromTMDB(`/movie/${id}`, {
      append_to_response: 'credits,videos,reviews,similar'
    });

    // Check if movie exists in our database
    let dbMovie = await Movie.findOne({ tmdbId: id });
    
    if (!dbMovie) {
      // Create movie entry in database
      dbMovie = new Movie({
        tmdbId: id,
        title: movieData.title,
        originalTitle: movieData.original_title,
        overview: movieData.overview,
        releaseDate: movieData.release_date ? new Date(movieData.release_date) : null,
        runtime: movieData.runtime,
        genres: movieData.genres,
        posterPath: movieData.poster_path,
        backdropPath: movieData.backdrop_path,
        voteAverage: movieData.vote_average,
        voteCount: movieData.vote_count,
        popularity: movieData.popularity,
        adult: movieData.adult,
        originalLanguage: movieData.original_language,
        productionCompanies: movieData.production_companies,
        productionCountries: movieData.production_countries,
        spokenLanguages: movieData.spoken_languages,
        status: movieData.status,
        tagline: movieData.tagline,
        budget: movieData.budget,
        revenue: movieData.revenue,
        homepage: movieData.homepage,
        imdbId: movieData.imdb_id,
        tmdbData: movieData
      });
      
      await dbMovie.save();
    }

    res.json({
      success: true,
      data: {
        ...movieData,
        userRatings: dbMovie.userRatings,
        averageUserRating: dbMovie.averageUserRating,
        media_type: 'movie'
      }
    });
  } catch (error) {
    console.error('Movie details error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch movie details'
    });
  }
});

// @route   POST /api/movies/recommendations
// @desc    Get AI-powered movie recommendations
// @access  Public
router.post('/recommendations', optionalAuth, async (req, res) => {
  try {
    const { movie_title, movie_overview = '', movie_rating = 0 } = req.body;

    if (!movie_title) {
      return res.status(400).json({
        success: false,
        message: 'Movie title is required'
      });
    }

    const prompt = `Based on "${movie_title}" (Rating: ${movie_rating}/10), provide 6 similar movie recommendations.

For each recommendation, provide:
- Title (Year)
- Brief description in 1-2 sentences  
- Why it's similar to ${movie_title}

Format as clean text with bullet points. No special characters, asterisks, or markdown formatting.

Movie Overview: ${movie_overview}`;

    const systemInstruction = "You are a movie expert and recommendation engine. Provide clean, well-formatted movie recommendations without special characters, asterisks, or excessive formatting. Use simple bullet points and clear text. Focus on titles, years, brief descriptions, and reasons why each recommendation is similar.";

    const recommendations = await generateAIContent(prompt, systemInstruction);

    res.json({
      success: true,
      data: {
        recommendations
      }
    });
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate recommendations'
    });
  }
});

// @route   POST /api/movies/reviews
// @desc    Get movie reviews analysis
// @access  Public
router.post('/reviews', optionalAuth, async (req, res) => {
  try {
    const { movie_title, movie_year = '' } = req.body;

    if (!movie_title) {
      return res.status(400).json({
        success: false,
        message: 'Movie title is required'
      });
    }

    // Try to get reviews from TMDB first
    let reviewsContent = '';
    let totalReviews = 0;

    try {
      // Search for the movie to get its ID
      const searchResult = await fetchFromTMDB('/search/movie', { query: movie_title });
      
      if (searchResult.results && searchResult.results.length > 0) {
        const movieId = searchResult.results[0].id;
        const reviewsData = await fetchFromTMDB(`/movie/${movieId}/reviews`);
        
        if (reviewsData.results && reviewsData.results.length > 0) {
          totalReviews = reviewsData.total_results;
          reviewsContent = 'Reviews from TMDB:\n\n';
          
          reviewsData.results.slice(0, 5).forEach((review, index) => {
            const author = review.author || 'Anonymous';
            const content = review.content.substring(0, 500);
            const rating = review.author_details?.rating || 'N/A';
            reviewsContent += `Author: ${author} (Rating: ${rating})\n${content}\n\n`;
          });
        }
      }
    } catch (error) {
      console.log('TMDB reviews fetch failed, continuing with AI analysis');
    }

    if (!reviewsContent) {
      reviewsContent = `No specific reviews found for ${movie_title}. Please provide a general critical analysis based on the movie's reputation and typical audience reception.`;
    }

    const prompt = `Analyze and summarize the following reviews for "${movie_title}":

${reviewsContent}

Provide a comprehensive summary that includes:
1. Overall critical consensus
2. Main strengths mentioned by reviewers
3. Common criticisms or weaknesses  
4. Target audience recommendations
5. Overall rating sentiment

Format as clean, readable text without special characters or excessive formatting.`;

    const systemInstruction = "You are a professional movie critic and review analyst. Summarize movie reviews in a clear, balanced way. Highlight both positive and negative aspects. Use clean formatting without special characters.";

    const reviewsSummary = await generateAIContent(prompt, systemInstruction);

    res.json({
      success: true,
      data: {
        reviews_summary: reviewsSummary,
        total_reviews: totalReviews
      }
    });
  } catch (error) {
    console.error('Reviews analysis error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to analyze movie reviews'
    });
  }
});

// @route   POST /api/movies/:id/rating
// @desc    Rate a movie
// @access  Private
router.post('/:id/rating', authenticate, validateMovieRating, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, review } = req.body;

    // Find or create movie in database
    let movie = await Movie.findOne({ tmdbId: id });
    
    if (!movie) {
      // Fetch movie data from TMDB to create database entry
      const tmdbData = await fetchFromTMDB(`/movie/${id}`);
      
      movie = new Movie({
        tmdbId: id,
        title: tmdbData.title,
        originalTitle: tmdbData.original_title,
        overview: tmdbData.overview,
        releaseDate: tmdbData.release_date ? new Date(tmdbData.release_date) : null,
        runtime: tmdbData.runtime,
        genres: tmdbData.genres,
        posterPath: tmdbData.poster_path,
        backdropPath: tmdbData.backdrop_path,
        voteAverage: tmdbData.vote_average,
        voteCount: tmdbData.vote_count,
        popularity: tmdbData.popularity,
        tmdbData
      });
    }

    await movie.addUserRating(req.user._id, rating, review);

    res.json({
      success: true,
      message: 'Rating added successfully',
      data: {
        averageUserRating: movie.averageUserRating,
        totalRatings: movie.userRatings.length
      }
    });
  } catch (error) {
    console.error('Add rating error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add rating'
    });
  }
});

// @route   GET /api/movies/genres/list
// @desc    Get list of movie genres
// @access  Public
router.get('/genres/list', async (req, res) => {
  try {
    const data = await fetchFromTMDB('/genre/movie/list');
    
    res.json({
      success: true,
      data: data.genres
    });
  } catch (error) {
    console.error('Genres list error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch genres'
    });
  }
});

module.exports = router;