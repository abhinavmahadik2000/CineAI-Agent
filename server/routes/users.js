const express = require('express');
const User = require('../models/User');
const Movie = require('../models/Movie');
const { validateProfileUpdate } = require('../middleware/validation');

const router = express.Router();

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: req.user
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', validateProfileUpdate, async (req, res) => {
  try {
    const { username, profile } = req.body;
    const userId = req.user._id;

    // Check if username is being changed and if it's already taken
    if (username && username !== req.user.username) {
      const existingUser = await User.findOne({ username, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Username already taken'
        });
      }
    }

    // Update user
    const updateData = {};
    if (username) updateData.username = username;
    if (profile) {
      updateData.profile = {
        ...req.user.profile,
        ...profile
      };
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: updatedUser
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// @route   GET /api/users/watchlist
// @desc    Get user watchlist
// @access  Private
router.get('/watchlist', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    res.json({
      success: true,
      data: {
        watchlist: user.preferences.watchlist || []
      }
    });
  } catch (error) {
    console.error('Get watchlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch watchlist'
    });
  }
});

// @route   POST /api/users/watchlist
// @desc    Add movie to watchlist
// @access  Private
router.post('/watchlist', async (req, res) => {
  try {
    const { movieId, title, posterPath } = req.body;

    if (!movieId || !title) {
      return res.status(400).json({
        success: false,
        message: 'Movie ID and title are required'
      });
    }

    const user = await User.findById(req.user._id);
    
    // Check if movie is already in watchlist
    const existingIndex = user.preferences.watchlist.findIndex(
      item => item.movieId === movieId
    );

    if (existingIndex > -1) {
      return res.status(400).json({
        success: false,
        message: 'Movie already in watchlist'
      });
    }

    // Add to watchlist
    user.preferences.watchlist.push({
      movieId,
      title,
      posterPath: posterPath || null,
      addedAt: new Date()
    });

    await user.save();

    res.json({
      success: true,
      message: 'Movie added to watchlist',
      data: {
        watchlist: user.preferences.watchlist
      }
    });
  } catch (error) {
    console.error('Add to watchlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add movie to watchlist'
    });
  }
});

// @route   DELETE /api/users/watchlist/:movieId
// @desc    Remove movie from watchlist
// @access  Private
router.delete('/watchlist/:movieId', async (req, res) => {
  try {
    const { movieId } = req.params;
    const user = await User.findById(req.user._id);

    // Remove from watchlist
    user.preferences.watchlist = user.preferences.watchlist.filter(
      item => item.movieId !== movieId
    );

    await user.save();

    res.json({
      success: true,
      message: 'Movie removed from watchlist',
      data: {
        watchlist: user.preferences.watchlist
      }
    });
  } catch (error) {
    console.error('Remove from watchlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove movie from watchlist'
    });
  }
});

// @route   GET /api/users/watched
// @desc    Get user watched movies
// @access  Private
router.get('/watched', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    res.json({
      success: true,
      data: {
        watchedMovies: user.preferences.watchedMovies || []
      }
    });
  } catch (error) {
    console.error('Get watched movies error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch watched movies'
    });
  }
});

// @route   POST /api/users/watched
// @desc    Mark movie as watched
// @access  Private
router.post('/watched', async (req, res) => {
  try {
    const { movieId, title, rating, review } = req.body;

    if (!movieId || !title) {
      return res.status(400).json({
        success: false,
        message: 'Movie ID and title are required'
      });
    }

    if (rating && (rating < 1 || rating > 10)) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 10'
      });
    }

    const user = await User.findById(req.user._id);
    
    // Check if movie is already marked as watched
    const existingIndex = user.preferences.watchedMovies.findIndex(
      item => item.movieId === movieId
    );

    if (existingIndex > -1) {
      // Update existing entry
      user.preferences.watchedMovies[existingIndex] = {
        ...user.preferences.watchedMovies[existingIndex],
        rating: rating || user.preferences.watchedMovies[existingIndex].rating,
        review: review || user.preferences.watchedMovies[existingIndex].review,
        watchedAt: new Date()
      };
    } else {
      // Add new entry
      user.preferences.watchedMovies.push({
        movieId,
        title,
        rating: rating || null,
        review: review || null,
        watchedAt: new Date()
      });
    }

    await user.save();

    res.json({
      success: true,
      message: 'Movie marked as watched',
      data: {
        watchedMovies: user.preferences.watchedMovies
      }
    });
  } catch (error) {
    console.error('Mark as watched error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark movie as watched'
    });
  }
});

// @route   PUT /api/users/preferences
// @desc    Update user preferences
// @access  Private
router.put('/preferences', async (req, res) => {
  try {
    const { favoriteGenres } = req.body;
    const userId = req.user._id;

    const validGenres = [
      'Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 
      'Documentary', 'Drama', 'Family', 'Fantasy', 'Film-Noir', 'History', 
      'Horror', 'Music', 'Musical', 'Mystery', 'Romance', 'Sci-Fi', 'Sport', 
      'Thriller', 'War', 'Western'
    ];

    if (favoriteGenres && !Array.isArray(favoriteGenres)) {
      return res.status(400).json({
        success: false,
        message: 'Favorite genres must be an array'
      });
    }

    if (favoriteGenres && favoriteGenres.some(genre => !validGenres.includes(genre))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid genre provided'
      });
    }

    const updateData = {};
    if (favoriteGenres) {
      updateData['preferences.favoriteGenres'] = favoriteGenres;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: {
        user: updatedUser
      }
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update preferences'
    });
  }
});

// @route   GET /api/users/stats
// @desc    Get user statistics
// @access  Private
router.get('/stats', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    const stats = {
      watchlistCount: user.preferences.watchlist.length,
      watchedCount: user.preferences.watchedMovies.length,
      averageRating: 0,
      favoriteGenres: user.preferences.favoriteGenres || [],
      chatHistoryCount: user.chatHistory.length,
      memberSince: user.createdAt,
      lastActive: user.lastLogin
    };

    // Calculate average rating
    const ratingsWithValues = user.preferences.watchedMovies.filter(movie => movie.rating);
    if (ratingsWithValues.length > 0) {
      const totalRating = ratingsWithValues.reduce((sum, movie) => sum + movie.rating, 0);
      stats.averageRating = Math.round((totalRating / ratingsWithValues.length) * 10) / 10;
    }

    res.json({
      success: true,
      data: {
        stats
      }
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user statistics'
    });
  }
});

// @route   DELETE /api/users/account
// @desc    Deactivate user account
// @access  Private
router.delete('/account', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required to deactivate account'
      });
    }

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');
    
    // Validate password
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid password'
      });
    }

    // Deactivate account (soft delete)
    user.isActive = false;
    await user.save();

    res.json({
      success: true,
      message: 'Account deactivated successfully'
    });
  } catch (error) {
    console.error('Deactivate account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate account'
    });
  }
});

module.exports = router;