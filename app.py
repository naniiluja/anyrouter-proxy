import os
import requests
from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import time
from collections import defaultdict
import logging

app = Flask(__name__)
CORS(app)

# Configuration
TARGET_URL = 'https://anyrouter.top'
PORT = int(os.environ.get('PORT', 5000))

# Simple rate limiting
request_counts = defaultdict(list)
RATE_LIMIT = 1000  # Much higher limit
RATE_WINDOW = 60  # 1 minute

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def is_rate_limited(client_ip):
    """Check if client is rate limited"""
    now = time.time()
    
    # Clean old requests
    request_counts[client_ip] = [
        req_time for req_time in request_counts[client_ip] 
        if now - req_time < RATE_WINDOW
    ]
    
    # Check rate limit
    if len(request_counts[client_ip]) >= RATE_LIMIT:
        return True
    
    # Add current request
    request_counts[client_ip].append(now)
    return False

@app.route('/health')
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'OK',
        'target': TARGET_URL,
        'timestamp': time.time()
    })

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def proxy(path):
    """Proxy all requests to target URL"""
    
    # Rate limiting
    client_ip = request.remote_addr or request.environ.get('HTTP_X_FORWARDED_FOR', 'unknown')
    if is_rate_limited(client_ip):
        return jsonify({
            'error': 'Too many requests',
            'message': f'Rate limit exceeded: {RATE_LIMIT} requests per minute'
        }), 429
    
    # Build target URL
    target_url = f"{TARGET_URL}/{path}"
    if request.query_string:
        target_url += f"?{request.query_string.decode()}"
    
    logger.info(f"{request.method} {target_url}")
    
    # Prepare headers
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Host': 'anyrouter.top',
        'Referer': 'https://anyrouter.top/'
    }
    
    # Copy some headers from original request
    for header in ['Authorization', 'Content-Type', 'Cookie']:
        if header in request.headers:
            headers[header] = request.headers[header]
    
    try:
        # Make request to target
        response = requests.request(
            method=request.method,
            url=target_url,
            headers=headers,
            data=request.get_data(),
            cookies=request.cookies,
            allow_redirects=False,  # Handle redirects manually
            timeout=30,
            verify=True
        )
        
        logger.info(f"Response: {response.status_code} for {path}")
        
        # Handle redirects
        if response.status_code in [301, 302, 303, 307, 308]:
            location = response.headers.get('Location', '')
            if location:
                # Only allow internal redirects
                if location.startswith('/') or 'anyrouter.top' in location:
                    logger.info(f"Allowing redirect to: {location}")
                else:
                    logger.info(f"Blocking external redirect to: {location}")
                    return jsonify({
                        'message': 'External redirect blocked',
                        'redirect_url': location
                    })
        
        # Prepare response headers
        response_headers = {}
        for key, value in response.headers.items():
            # Skip problematic headers
            if key.lower() not in ['content-encoding', 'content-length', 'transfer-encoding', 'connection']:
                response_headers[key] = value
        
        # Remove auto-refresh headers
        response_headers.pop('Refresh', None)
        response_headers.pop('X-Refresh', None)
        
        # Create Flask response
        flask_response = Response(
            response.content,
            status=response.status_code,
            headers=response_headers
        )
        
        return flask_response
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Proxy error: {e}")
        return jsonify({
            'error': 'Proxy error occurred',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    logger.info(f"Starting proxy server on port {PORT}")
    logger.info(f"Proxying requests to: {TARGET_URL}")
    app.run(host='0.0.0.0', port=PORT, debug=False)