const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema({
  tmdbId: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  originalTitle: {
    type: String,
    trim: true
  },
  overview: {
    type: String,
    trim: true
  },
  releaseDate: {
    type: Date
  },
  runtime: {
    type: Number // in minutes
  },
  genres: [{
    id: Number,
    name: String
  }],
  posterPath: {
    type: String
  },
  backdropPath: {
    type: String
  },
  voteAverage: {
    type: Number,
    min: 0,
    max: 10
  },
  voteCount: {
    type: Number,
    default: 0
  },
  popularity: {
    type: Number,
    default: 0
  },
  adult: {
    type: Boolean,
    default: false
  },
  originalLanguage: {
    type: String,
    default: 'en'
  },
  productionCompanies: [{
    id: Number,
    name: String,
    logoPath: String,
    originCountry: String
  }],
  productionCountries: [{
    iso_3166_1: String,
    name: String
  }],
  spokenLanguages: [{
    englishName: String,
    iso_639_1: String,
    name: String
  }],
  status: {
    type: String,
    enum: ['Rumored', 'Planned', 'In Production', 'Post Production', 'Released', 'Canceled'],
    default: 'Released'
  },
  tagline: {
    type: String,
    trim: true
  },
  budget: {
    type: Number,
    default: 0
  },
  revenue: {
    type: Number,
    default: 0
  },
  homepage: {
    type: String,
    trim: true
  },
  imdbId: {
    type: String,
    trim: true
  },
  // User-generated content
  userRatings: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, min: 1, max: 10 },
    review: String,
    createdAt: { type: Date, default: Date.now }
  }],
  // Cached data from external APIs
  tmdbData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  reviewsSummary: {
    aiAnalysis: String,
    lastUpdated: Date,
    sources: [String]
  },
  recommendations: {
    aiGenerated: [String],
    lastUpdated: Date,
    basedOn: String
  }
}, {
  timestamps: true
});

// Indexes for better performance
movieSchema.index({ tmdbId: 1 });
movieSchema.index({ title: 'text', overview: 'text' });
movieSchema.index({ 'genres.name': 1 });
movieSchema.index({ releaseDate: -1 });
movieSchema.index({ voteAverage: -1 });
movieSchema.index({ popularity: -1 });

// Virtual for average user rating
movieSchema.virtual('averageUserRating').get(function() {
  if (this.userRatings.length === 0) return 0;
  const sum = this.userRatings.reduce((acc, rating) => acc + rating.rating, 0);
  return Math.round((sum / this.userRatings.length) * 10) / 10;
});

// Method to add user rating
movieSchema.methods.addUserRating = function(userId, rating, review) {
  const existingRatingIndex = this.userRatings.findIndex(r => r.userId.toString() === userId.toString());
  
  if (existingRatingIndex > -1) {
    // Update existing rating
    this.userRatings[existingRatingIndex].rating = rating;
    this.userRatings[existingRatingIndex].review = review;
    this.userRatings[existingRatingIndex].createdAt = new Date();
  } else {
    // Add new rating
    this.userRatings.push({ userId, rating, review });
  }
  
  return this.save();
};

module.exports = mongoose.model('Movie', movieSchema);