import requests
import unittest
import json
import sys
import re
from datetime import datetime

class CineAIBackendTester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)

            success = response.status_code == expected_status
            
            result = {
                "name": name,
                "url": url,
                "method": method,
                "expected_status": expected_status,
                "actual_status": response.status_code,
                "success": success
            }
            
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                if response.status_code == 200 or response.status_code == 201:
                    result["response"] = response.json()
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                if response.text:
                    print(f"Response: {response.text[:200]}...")
                    result["error"] = response.text

            self.test_results.append(result)
            return success, response.json() if success and response.status_code != 204 else {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.test_results.append({
                "name": name,
                "url": url,
                "method": method,
                "success": False,
                "error": str(e)
            })
            return False, {}

    def test_health_check(self):
        """Test the API health check endpoint"""
        return self.run_test(
            "API Health Check",
            "GET",
            "api",
            200
        )

    def test_search_movies(self, query):
        """Test the movie search endpoint"""
        return self.run_test(
            f"Search Movies for '{query}'",
            "GET",
            "api/movies/search",
            200,
            params={"query": query}
        )

    def test_trending_movies(self):
        """Test the trending movies endpoint"""
        return self.run_test(
            "Trending Movies",
            "GET",
            "api/movies/trending",
            200
        )

    def test_ai_recommendations(self, movie_title, movie_overview="", movie_rating=8.5):
        """Test the AI recommendations endpoint"""
        success, response = self.run_test(
            f"AI Recommendations for '{movie_title}'",
            "POST",
            "api/movies/recommendations",
            200,
            data={
                "movie_title": movie_title,
                "movie_overview": movie_overview,
                "movie_rating": movie_rating
            }
        )
        
        # Check if the response is clean and well-formatted
        if success and "recommendations" in response:
            recommendations = response["recommendations"]
            # Check for excessive special characters or formatting issues
            has_special_chars = bool(re.search(r'[*#]{2,}', recommendations))
            has_excessive_newlines = bool(re.search(r'\n{3,}', recommendations))
            
            if has_special_chars or has_excessive_newlines:
                print("❌ Response contains formatting issues:")
                if has_special_chars:
                    print("  - Contains excessive special characters (*#)")
                if has_excessive_newlines:
                    print("  - Contains excessive newlines")
                self.test_results[-1]["success"] = False
                self.tests_passed -= 1
                return False, response
            else:
                print("✅ Response is clean and well-formatted")
        
        return success, response

    def test_movie_reviews(self, movie_title, movie_year=""):
        """Test the movie reviews endpoint"""
        return self.run_test(
            f"Movie Reviews for '{movie_title}'",
            "POST",
            "api/movies/reviews",
            200,
            data={
                "movie_title": movie_title,
                "movie_year": movie_year
            }
        )
        
    def test_movie_chatbot(self, message, context=""):
        """Test the movie chatbot endpoint"""
        return self.run_test(
            f"Movie Chatbot with message: '{message}'",
            "POST",
            "api/chat/movie",
            200,
            data={
                "message": message,
                "context": context
            }
        )

    def print_summary(self):
        """Print a summary of the test results"""
        print("\n" + "="*50)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        print("="*50)
        
        for result in self.test_results:
            status = "✅" if result["success"] else "❌"
            print(f"{status} {result['name']} - {result['method']} {result['url']}")
        
        print("="*50)
        return self.tests_passed == self.tests_run

def main():
    # Get the backend URL from the frontend .env file
    with open('/app/frontend/.env', 'r') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                backend_url = line.strip().split('=')[1].strip('"')
                break
    
    print(f"Using backend URL: {backend_url}")
    
    # Setup tester
    tester = CineAIBackendTester(backend_url)
    
    # Run tests
    tester.test_health_check()
    
    # Test search with different queries
    tester.test_search_movies("Inception")
    tester.test_search_movies("The Matrix")
    tester.test_search_movies("Breaking Bad")
    
    # Test trending movies
    tester.test_trending_movies()
    
    # Test AI recommendations (clean formatting)
    success, recommendations_data = tester.test_ai_recommendations(
        "Inception", 
        "A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.",
        8.8
    )
    
    # Test movie reviews functionality
    tester.test_movie_reviews("The Matrix", "1999")
    
    # Test chatbot functionality
    tester.test_movie_chatbot("What are some good sci-fi movies like The Matrix?")
    
    # Test chatbot conversation flow with context
    success, first_response = tester.test_movie_chatbot("Tell me about Inception")
    if success and "response" in first_response:
        context = f"user: Tell me about Inception\nbot: {first_response['response']}"
        tester.test_movie_chatbot("Who directed it?", context)
    
    # Print summary
    success = tester.print_summary()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())