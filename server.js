const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Target website
const TARGET_URL = 'https://anyrouter.top';

// Enable CORS
app.use(cors());

// Log requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Proxy middleware configuration
const proxyOptions = {
  target: TARGET_URL,
  changeOrigin: true,
  followRedirects: false, // Disable automatic redirects
  secure: true,
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  },
  onProxyReq: (proxyReq, req, res) => {
    // Remove problematic headers
    proxyReq.removeHeader('host');
    proxyReq.removeHeader('referer');
    proxyReq.removeHeader('origin');
    
    // Log outgoing requests
    console.log(`Proxying: ${req.method} ${TARGET_URL}${req.url}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    // Handle redirects manually
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400) {
      const location = proxyRes.headers.location;
      if (location) {
        console.log(`Redirect ${proxyRes.statusCode}: ${location}`);
        // Check if redirect is to the same domain
        if (location.startsWith('/') || location.includes('anyrouter.top')) {
          // Allow internal redirects
          const redirectUrl = location.startsWith('/') ? location : new URL(location).pathname + new URL(location).search;
          proxyRes.headers.location = redirectUrl;
        } else {
          // Block external redirects
          console.log('Blocking external redirect to:', location);
          res.status(200).json({ 
            message: 'External redirect blocked',
            redirect_url: location 
          });
          return;
        }
      }
    }
    
    // Log responses
    console.log(`Response: ${proxyRes.statusCode} for ${req.url}`);
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Proxy error occurred',
        message: err.message,
        code: err.code
      });
    }
  }
};

// Create proxy middleware
const proxy = createProxyMiddleware(proxyOptions);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    target: TARGET_URL,
    timestamp: new Date().toISOString()
  });
});

// Proxy all requests to anyrouter.top
app.use('/', proxy);

// Start server
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
  console.log(`Proxying requests to: ${TARGET_URL}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});