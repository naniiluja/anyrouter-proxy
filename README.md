# Anyrouter Proxy Server

Proxy server để test API từ anyrouter.top một cách an toàn.

## Phiên bản Python (Khuyến nghị)

### Cài đặt

```bash
pip install -r requirements.txt
```

### Chạy local

```bash
# Development mode
python app.py

# Production mode với Gunicorn
gunicorn app:app
```

### Deploy lên Render

1. Push code lên GitHub
2. Kết nối repo với Render.com
3. Chọn Environment: **Python 3**
4. Build Command: `pip install -r requirements.txt`
5. Start Command: `gunicorn app:app`

## Phiên bản Node.js (Legacy)

### Cài đặt

```bash
npm install
```

### Chạy local

```bash
# Development mode
npm run dev

# Production mode
npm start
```

## Sử dụng

Server sẽ chạy trên port 5000 (Python) hoặc 3000 (Node.js).

- Health check: `http://localhost:5000/health`
- Proxy: `http://localhost:5000/` → forwards to `https://anyrouter.top/`

## Tính năng

- ✅ Forward tất cả requests tới anyrouter.top
- ✅ Preserve headers và responses
- ✅ CORS enabled
- ✅ Rate limiting (1000 requests/phút)
- ✅ Error handling
- ✅ Health check endpoint
- ✅ Request logging
- ✅ Block external redirects