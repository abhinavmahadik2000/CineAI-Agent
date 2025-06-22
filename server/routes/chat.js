const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const User = require('../models/User');
const { validateChatMessage } = require('../middleware/validation');

const router = express.Router();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper function to clean AI responses
const cleanAIResponse = (text) => {
  return text
    .replace(/\*{2,}/g, '')
    .replace(/#{2,}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// @route   POST /api/chat/movie
// @desc    Chat with AI about movies
// @access  Private
router.post('/movie', validateChatMessage, async (req, res) => {
  try {
    const { message, context = '' } = req.body;
    const userId = req.user._id;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'AI service not configured'
      });
    }

    // Get user's chat history for context
    const user = await User.findById(userId);
    let conversationContext = context;

    // Add recent chat history for better context (last 5 interactions)
    const recentChats = user.chatHistory.slice(-5);
    if (recentChats.length > 0) {
      const historyContext = recentChats
        .map(chat => `User: ${chat.message}\nBot: ${chat.response}`)
        .join('\n\n');
      conversationContext = `${historyContext}\n\n${conversationContext}`;
    }

    // Add user preferences for personalized recommendations
    const preferences = user.preferences;
    const userInfo = [];
    
    if (preferences.favoriteGenres && preferences.favoriteGenres.length > 0) {
      userInfo.push(`Favorite genres: ${preferences.favoriteGenres.join(', ')}`);
    }
    
    if (preferences.watchedMovies && preferences.watchedMovies.length > 0) {
      const recentWatched = preferences.watchedMovies
        .slice(-3)
        .map(movie => `${movie.title} (rated ${movie.rating}/10)`)
        .join(', ');
      userInfo.push(`Recently watched: ${recentWatched}`);
    }

    const userContext = userInfo.length > 0 ? `\n\nUser preferences: ${userInfo.join('; ')}` : '';

    const systemInstruction = `You are CineBot, an expert movie and TV show assistant. You help users discover movies, discuss plots, recommend shows, and answer questions about cinema.

Guidelines:
- Be conversational and enthusiastic about movies
- Provide specific recommendations with reasons
- Help with movie trivia and facts
- Discuss plot points without major spoilers unless asked
- Format responses clearly without special characters
- Keep responses concise but informative
- If asked about non-movie topics, gently redirect to movies/TV shows
- Use the user's preferences and watch history to provide personalized recommendations

User context: ${userContext}`;

    const fullPrompt = conversationContext 
      ? `Previous conversation context:\n${conversationContext}\n\nCurrent message: ${message}`
      : message;

    const model = genAI.getGenerativeModel({ 
      model: "gemini-pro",
      systemInstruction
    });

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const aiResponse = cleanAIResponse(response.text());

    // Save chat interaction to user's history
    user.chatHistory.push({
      message,
      response: aiResponse,
      timestamp: new Date()
    });

    // Keep only last 50 chat interactions to prevent database bloat
    if (user.chatHistory.length > 50) {
      user.chatHistory = user.chatHistory.slice(-50);
    }

    await user.save();

    res.json({
      success: true,
      data: {
        response: aiResponse,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Movie chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process chat message'
    });
  }
});

// @route   GET /api/chat/history
// @desc    Get user's chat history
// @access  Private
router.get('/history', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const userId = req.user._id;

    const user = await User.findById(userId);
    const totalChats = user.chatHistory.length;
    const startIndex = Math.max(0, totalChats - (page * limit));
    const endIndex = Math.max(0, totalChats - ((page - 1) * limit));

    const chatHistory = user.chatHistory
      .slice(startIndex, endIndex)
      .reverse(); // Most recent first

    res.json({
      success: true,
      data: {
        chatHistory,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalChats / limit),
          totalChats,
          hasMore: startIndex > 0
        }
      }
    });
  } catch (error) {
    console.error('Get chat history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat history'
    });
  }
});

// @route   DELETE /api/chat/history
// @desc    Clear user's chat history
// @access  Private
router.delete('/history', async (req, res) => {
  try {
    const userId = req.user._id;

    await User.findByIdAndUpdate(userId, {
      chatHistory: []
    });

    res.json({
      success: true,
      message: 'Chat history cleared successfully'
    });
  } catch (error) {
    console.error('Clear chat history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear chat history'
    });
  }
});

// @route   GET /api/chat/suggestions
// @desc    Get chat suggestions based on user preferences
// @access  Private
router.get('/suggestions', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const suggestions = [];

    // Basic suggestions
    const basicSuggestions = [
      "What are some good movies to watch tonight?",
      "Recommend me a thriller movie",
      "What's the best sci-fi movie of all time?",
      "Tell me about the latest Marvel movies",
      "What are some underrated gems I should watch?"
    ];

    suggestions.push(...basicSuggestions);

    // Personalized suggestions based on favorite genres
    if (user.preferences.favoriteGenres && user.preferences.favoriteGenres.length > 0) {
      user.preferences.favoriteGenres.slice(0, 2).forEach(genre => {
        suggestions.push(`Recommend me a good ${genre.toLowerCase()} movie`);
      });
    }

    // Suggestions based on recent watches
    if (user.preferences.watchedMovies && user.preferences.watchedMovies.length > 0) {
      const recentMovie = user.preferences.watchedMovies[user.preferences.watchedMovies.length - 1];
      suggestions.push(`Movies similar to ${recentMovie.title}`);
    }

    // Shuffle and limit suggestions
    const shuffled = suggestions.sort(() => 0.5 - Math.random());
    
    res.json({
      success: true,
      data: {
        suggestions: shuffled.slice(0, 8)
      }
    });
  } catch (error) {
    console.error('Get chat suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat suggestions'
    });
  }
});

module.exports = router;