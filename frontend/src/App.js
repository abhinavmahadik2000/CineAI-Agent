import React, { useState, useEffect } from "react";
import "./App.css";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SearchBar = ({ onSearch, isLoading }) => {
  const [query, setQuery] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-4xl mx-auto relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for movies, TV shows, actors..."
          className="w-full px-6 py-4 text-lg bg-gray-900/50 border border-gray-700 rounded-full text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent backdrop-blur-sm transition-all duration-300"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 px-6 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            "Search"
          )}
        </button>
      </div>
    </form>
  );
};

const MovieCard = ({ movie, onClick }) => {
  const posterUrl = movie.poster_path 
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    : "/api/placeholder/300/450";

  return (
    <div 
      className="group cursor-pointer transform transition-all duration-300 hover:scale-105 hover:z-10"
      onClick={() => onClick(movie)}
    >
      <div className="relative overflow-hidden rounded-lg shadow-lg bg-gray-900/50 backdrop-blur-sm">
        <div className="aspect-[2/3] overflow-hidden">
          <img
            src={posterUrl}
            alt={movie.title || movie.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
            onError={(e) => {
              e.target.src = "/api/placeholder/300/450";
            }}
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div className="absolute bottom-0 left-0 right-0 p-4 text-white transform translate-y-full group-hover:translate-y-0 transition-transform duration-300">
          <h3 className="font-bold text-lg mb-1 line-clamp-2">{movie.title || movie.name}</h3>
          <p className="text-sm text-gray-300 mb-2">{movie.release_date || movie.first_air_date}</p>
          <div className="flex items-center gap-2">
            <span className="text-yellow-400">★</span>
            <span className="text-sm">{movie.vote_average?.toFixed(1) || "N/A"}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const MovieGrid = ({ movies, onMovieClick }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
      {movies.map((movie) => (
        <MovieCard 
          key={movie.id} 
          movie={movie} 
          onClick={onMovieClick}
        />
      ))}
    </div>
  );
};

const MovieDetail = ({ movie, onClose, onGetRecommendations }) => {
  const backdropUrl = movie.backdrop_path 
    ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`
    : "/api/placeholder/1280/720";

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 overflow-y-auto">
      <div className="min-h-screen relative">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: `url(${backdropUrl})` }}
        ></div>
        <div className="relative z-10 p-6">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 text-white hover:text-red-500 transition-colors text-2xl"
          >
            ✕
          </button>
          
          <div className="max-w-6xl mx-auto pt-16">
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="lg:w-1/3">
                <img
                  src={movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "/api/placeholder/300/450"}
                  alt={movie.title || movie.name}
                  className="w-full max-w-sm mx-auto rounded-lg shadow-2xl"
                />
              </div>
              
              <div className="lg:w-2/3 text-white">
                <h1 className="text-4xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                  {movie.title || movie.name}
                </h1>
                
                <div className="flex flex-wrap items-center gap-4 mb-6 text-gray-300">
                  <span className="flex items-center gap-1">
                    <span className="text-yellow-400">★</span>
                    {movie.vote_average?.toFixed(1) || "N/A"}
                  </span>
                  <span>{movie.release_date || movie.first_air_date}</span>
                  <span className="px-3 py-1 bg-red-600 rounded-full text-sm">
                    {movie.media_type === 'tv' ? 'TV Show' : 'Movie'}
                  </span>
                </div>
                
                <p className="text-lg text-gray-300 mb-8 leading-relaxed">
                  {movie.overview || "No description available."}
                </p>
                
                <div className="flex flex-wrap gap-4">
                  <button
                    onClick={() => onGetRecommendations(movie)}
                    className="px-6 py-3 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors duration-200 font-semibold"
                  >
                    Get AI Recommendations
                  </button>
                  <button className="px-6 py-3 bg-gray-700 text-white rounded-full hover:bg-gray-600 transition-colors duration-200 font-semibold">
                    Read Reviews
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AIRecommendations = ({ recommendations, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 overflow-y-auto">
      <div className="min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold text-white">AI Recommendations</h2>
            <button
              onClick={onClose}
              className="text-white hover:text-red-500 transition-colors text-2xl"
            >
              ✕
            </button>
          </div>
          
          <div className="bg-gray-900/50 backdrop-blur-sm rounded-lg p-6 text-white">
            <div className="prose prose-invert max-w-none">
              <div className="whitespace-pre-wrap text-gray-300 leading-relaxed">
                {recommendations}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [recommendations, setRecommendations] = useState("");
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [error, setError] = useState("");

  const searchMovies = async (query) => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(`${API}/movies/search`, {
        params: { query }
      });
      setSearchResults(response.data.results || []);
    } catch (error) {
      console.error("Search error:", error);
      setError("Failed to search movies. Please check if TMDB API key is configured.");
    } finally {
      setIsLoading(false);
    }
  };

  const getRecommendations = async (movie) => {
    setIsLoading(true);
    try {
      const response = await axios.post(`${API}/movies/recommendations`, {
        movie_title: movie.title || movie.name,
        movie_overview: movie.overview,
        movie_genre: movie.genre_ids,
        movie_rating: movie.vote_average
      });
      setRecommendations(response.data.recommendations);
      setShowRecommendations(true);
    } catch (error) {
      console.error("Recommendations error:", error);
      setError("Failed to get AI recommendations. Please check if Gemini API key is configured.");
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = async () => {
    try {
      const response = await axios.get(`${API}/`);
      console.log("Backend connected:", response.data.message);
    } catch (e) {
      console.error("Backend connection failed:", e);
    }
  };

  useEffect(() => {
    testConnection();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,0,0,0.1)_0%,_transparent_50%)] pointer-events-none"></div>
      
      {/* Header */}
      <header className="relative z-10 p-6 text-center">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-red-500 via-red-400 to-orange-500 bg-clip-text text-transparent animate-pulse">
            CineAI
          </h1>
          <p className="text-xl text-gray-300 mb-8">
            Discover movies and TV shows with AI-powered recommendations
          </p>
          
          <SearchBar onSearch={searchMovies} isLoading={isLoading} />
        </div>
      </header>

      {/* Error Message */}
      {error && (
        <div className="max-w-7xl mx-auto px-6 mb-6">
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-200">
            {error}
          </div>
        </div>
      )}

      {/* Content */}
      <main className="relative z-10 p-6">
        <div className="max-w-7xl mx-auto">
          {searchResults.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold mb-6 text-gray-200">
                Search Results ({searchResults.length})
              </h2>
              <MovieGrid 
                movies={searchResults} 
                onMovieClick={setSelectedMovie}
              />
            </div>
          )}

          {searchResults.length === 0 && !isLoading && (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">🎬</div>
              <h2 className="text-2xl font-bold mb-4 text-gray-300">
                Ready to discover your next favorite?
              </h2>
              <p className="text-gray-400 max-w-md mx-auto">
                Search for movies, TV shows, or actors to get started with AI-powered recommendations and reviews.
              </p>
            </div>
          )}

          {isLoading && (
            <div className="text-center py-20">
              <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-400">Searching...</p>
            </div>
          )}
        </div>
      </main>

      {/* Movie Detail Modal */}
      {selectedMovie && (
        <MovieDetail
          movie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
          onGetRecommendations={getRecommendations}
        />
      )}

      {/* AI Recommendations Modal */}
      {showRecommendations && (
        <AIRecommendations
          recommendations={recommendations}
          onClose={() => setShowRecommendations(false)}
        />
      )}
    </div>
  );
}

export default App;