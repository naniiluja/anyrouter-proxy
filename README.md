# Anyrouter Proxy Server

Proxy server để test API từ anyrouter.top một cách an toàn.

## Cài đặt

```bash
npm install
```

## Chạy local

```bash
# Development mode
npm run dev

# Production mode
npm start
```

## Sử dụng

Server sẽ chạy trên port 3000 (hoặc PORT environment variable).

- Health check: `http://localhost:3000/health`
- Proxy: `http://localhost:3000/` → forwards to `https://anyrouter.top/`

## Deploy lên Render

1. Push code lên GitHub
2. Kết nối repo với Render.com
3. Render sẽ tự động deploy

## Tính năng

- ✅ Forward tất cả requests tới anyrouter.top
- ✅ Preserve headers và responses
- ✅ CORS enabled
- ✅ Error handling
- ✅ Health check endpoint
- ✅ Request logging