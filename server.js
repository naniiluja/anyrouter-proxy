const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Target website
const TARGET_URL = 'https://anyrouter.top';

// Simple rate limiting
const requestCounts = new Map();
const RATE_LIMIT = 10; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

// Enable CORS
app.use(cors());

// Rate limiting middleware
app.use((req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!requestCounts.has(clientIP)) {
    requestCounts.set(clientIP, { count: 1, windowStart: now });
  } else {
    const client = requestCounts.get(clientIP);
    
    if (now - client.windowStart > RATE_WINDOW) {
      // Reset window
      client.count = 1;
      client.windowStart = now;
    } else {
      client.count++;
      
      if (client.count > RATE_LIMIT) {
        return res.status(429).json({ 
          error: 'Too many requests',
          message: `Rate limit exceeded: ${RATE_LIMIT} requests per minute`
        });
      }
    }
  }
  
  next();
});

// Simple cache to avoid repeated requests
const cache = new Map();
const CACHE_TTL = 5 * 1000; // 5 seconds

// Cache middleware
app.use((req, res, next) => {
  const cacheKey = `${req.method}:${req.url}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`Cache hit for ${req.url}`);
    return res.status(cached.statusCode).set(cached.headers).send(cached.data);
  }
  
  // Store original res.end to intercept response
  const originalEnd = res.end;
  const originalWrite = res.write;
  const originalWriteHead = res.writeHead;
  
  let responseData = Buffer.alloc(0);
  let statusCode = 200;
  let headers = {};
  
  res.writeHead = function(code, head) {
    statusCode = code;
    headers = head || {};
    return originalWriteHead.call(this, code, head);
  };
  
  res.write = function(chunk) {
    if (chunk) {
      responseData = Buffer.concat([responseData, Buffer.from(chunk)]);
    }
    return originalWrite.call(this, chunk);
  };
  
  res.end = function(chunk) {
    if (chunk) {
      responseData = Buffer.concat([responseData, Buffer.from(chunk)]);
    }
    
    // Cache successful responses
    if (statusCode === 200 && responseData.length > 0) {
      cache.set(cacheKey, {
        statusCode,
        headers,
        data: responseData,
        timestamp: Date.now()
      });
    }
    
    return originalEnd.call(this, chunk);
  };
  
  next();
});

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
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  },
  onProxyReq: (proxyReq, req, res) => {
    // Set proper Host header
    proxyReq.setHeader('Host', 'anyrouter.top');
    
    // Set proper Referer to avoid CDN blocking
    proxyReq.setHeader('Referer', 'https://anyrouter.top/');
    
    // Remove problematic headers that might cause issues
    proxyReq.removeHeader('x-forwarded-for');
    proxyReq.removeHeader('x-forwarded-proto');
    proxyReq.removeHeader('x-forwarded-host');
    
    // Log outgoing requests
    console.log(`Proxying: ${req.method} ${TARGET_URL}${req.url}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    // Remove auto-refresh headers
    delete proxyRes.headers['refresh'];
    delete proxyRes.headers['x-refresh'];
    
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
    
    // Modify HTML content to remove auto-refresh
    if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
      let data = [];
      proxyRes.on('data', (chunk) => {
        data.push(chunk);
      });
      
      proxyRes.on('end', () => {
        const buffer = Buffer.concat(data);
        let html = buffer.toString();
        
        // Remove meta refresh tags
        html = html.replace(/<meta[^>]*http-equiv=["']refresh["'][^>]*>/gi, '');
        
        // Remove auto-refresh JavaScript patterns
        html = html.replace(/setTimeout\s*\(\s*[^,]*,\s*\d+\s*\)/gi, '');
        html = html.replace(/setInterval\s*\(\s*[^,]*,\s*\d+\s*\)/gi, '');
        html = html.replace(/window\.location\.reload\s*\(\s*\)/gi, '');
        
        // Update content length
        proxyRes.headers['content-length'] = Buffer.byteLength(html);
        
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        res.end(html);
      });
      
      return; // Don't pipe the original response
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