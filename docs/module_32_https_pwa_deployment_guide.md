# CogniDesk Module 32 — Public HTTPS PWA Deployment Guide

**Target Environment**: Production HTTPS Public Web Deployment  
**Applicability**: CogniDesk PWA (React + TypeScript + Vite + Service Worker)  
**Security Requirement**: PWA specifications, Service Workers, and WebGPU hardware APIs strictly mandate a secure HTTPS context.

---

## 1. Prerequisites for PWA & WebGPU

To enable desktop and mobile installation prompts, background service worker caching, and hardware acceleration:
1. **Valid SSL/TLS Certificate**: Service workers will NOT register on plain HTTP (except on `http://localhost` or `http://127.0.0.1`).
2. **Proper MIME Types**:
   - `manifest.webmanifest` must be served as `application/manifest+json`.
   - `sw.js` must be served as `application/javascript` with header `Service-Worker-Allowed: /`.
3. **SPA URL Routing**: Any request to deep routes (e.g., `/chat`, `/notes`, `/flashcards`, `/settings`) must rewrite to `/index.html`.

---

## 2. Option A: Cloudflare Pages / Vercel / Netlify (Recommended Static Edge)

Because `frontend/dist` is only **3.59 MB**, it is ideally suited for global edge hosting with free SSL.

### 2.1 Cloudflare Pages Deployment
1. **Build the production bundle**:
   ```bash
   cd frontend
   npm run build
   ```
2. **Deploy via Wrangler CLI**:
   ```bash
   npx wrangler pages deploy dist --project-name cognidesk
   ```
3. **Configure SPA Rewrite & Headers**:
   Create `frontend/public/_headers`:
   ```http
   /sw.js
     Cache-Control: no-cache, no-store, must-revalidate
     Service-Worker-Allowed: /
     Content-Type: application/javascript

   /manifest.webmanifest
     Cache-Control: no-cache, must-revalidate
     Content-Type: application/manifest+json

   /assets/*
     Cache-Control: public, max-age=31536000, immutable
   ```
   Create `frontend/public/_redirects`:
   ```
   /*    /index.html   200
   ```

### 2.2 Vercel Deployment
Create `frontend/vercel.json`:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://api.yourdomain.com/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/sw.js",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" },
        { "key": "Service-Worker-Allowed", "value": "/" }
      ]
    },
    {
      "source": "/manifest.webmanifest",
      "headers": [
        { "key": "Content-Type", "value": "application/manifest+json" }
      ]
    }
  ]
}
```

---

## 3. Option B: Self-Hosted Docker + Nginx (with Let's Encrypt SSL)

For self-hosted instances running both frontend and FastAPI backend behind a single domain with automatic HTTPS.

### 3.1 Nginx Configuration (`docker/nginx.conf`)
```nginx
server {
    listen 80;
    server_name cognidesk.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name cognidesk.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/cognidesk.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cognidesk.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    root /usr/share/nginx/html;
    index index.html;

    # Service Worker: Do NOT cache sw.js
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Service-Worker-Allowed "/";
        add_header Content-Type "application/javascript";
    }

    # Web Manifest
    location = /manifest.webmanifest {
        add_header Cache-Control "no-cache, must-revalidate";
        add_header Content-Type "application/manifest+json";
    }

    # Static assets with cache busting
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # FastAPI Backend Reverse Proxy
    location /api/ {
        proxy_pass http://backend:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        # SSE Streaming support for /rag/stream
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
        proxy_buffering off;
        proxy_cache off;
    }

    # SPA Fallback for client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 4. FastAPI Backend Configuration for HTTPS

In `backend/.env` or docker-compose environment variables:
```env
ENVIRONMENT=production
BACKEND_CORS_ORIGINS=["https://cognidesk.yourdomain.com"]
HOST=0.0.0.0
PORT=8000
```
This ensures the backend issues tokens and responds to API requests from your custom HTTPS domain without CORS errors.

---

## 5. Post-Deployment Verification Checklist

Once deployed to your HTTPS URL:
1. **Lighthouse Audit**: Run Chrome DevTools -> Lighthouse -> Check "Progressive Web App". It must pass "Installable" and "Configured for a custom splash screen".
2. **Service Worker Verification**:
   - Open DevTools -> Application -> Service Workers.
   - Status should read `activated and is running` with source `/sw.js`.
3. **Offline Installation & Relaunch**:
   - Click the "Install" icon in Chrome's address bar or the "Install CogniDesk" button in Navbar.
   - Disconnect Wi-Fi (or check "Offline" in DevTools Network tab).
   - Reload the page. CogniDesk should launch immediately with the offline badge visible.
4. **Offline Persistence**:
   - Create a note or flashcard while offline.
   - Close the browser tab or standalone app completely.
   - Reopen the app offline. All notes, flashcards, and local document chunks should be present.
