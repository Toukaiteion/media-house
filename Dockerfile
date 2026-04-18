# Multi-stage Dockerfile for MediaHouse - Frontend (React+Vite) + Backend (.NET 10.0) + Nginx

# ===========================================
# Stage 1: Build Frontend (React + Vite)
# ===========================================
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

# Copy package files
COPY media-house-view/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source code
COPY media-house-view/ ./

# Build frontend
RUN npm run build

# ===========================================
# Stage 2: Build Backend (.NET 10.0)
# ===========================================
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend-build

WORKDIR /app/backend

# Copy csproj and restore dependencies
COPY media-house-admin/media-house-admin/media-house-admin.csproj ./
COPY media-house-admin/media-house-admin/NuGet.Config ./
RUN dotnet restore

# Copy backend source code
COPY media-house-admin/media-house-admin/ ./

# Publish backend
RUN dotnet publish -c Release -o /app/publish

# ===========================================
# Stage 3: Runtime - Install dependencies
# ===========================================
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base

# Install system dependencies including Chrome (headless mode only) and Nginx
RUN apt-get update && apt-get install -y \
    # Chrome dependencies for headless mode
    ca-certificates \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    # FFmpeg for media processing
    ffmpeg \
    # Nginx
    nginx \
    # Other useful tools
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Chrome from local deb package (download first using ./docker/download-chrome.sh)
COPY docker/google-chrome-stable.deb /tmp/google-chrome-stable.deb
RUN apt-get update && apt-get install -y /tmp/google-chrome-stable.deb \
    && rm /tmp/google-chrome-stable.deb \
    && rm -rf /var/lib/apt/lists/*

# Add Chrome to PATH and set up for headless mode
ENV CHROME_BIN=/usr/bin/google-chrome-stable \
    CHROME_PATH=/usr/bin/google-chrome-stable \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /app

# ===========================================
# Stage 4: Final Runtime Image
# ===========================================
FROM base

# Copy backend publish output
COPY --from=backend-build /app/publish /app

# Copy frontend build output to wwwroot for static file serving
COPY --from=frontend-build /app/frontend/dist /app/wwwroot

# Copy nginx configuration
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Copy startup script
COPY docker/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Create necessary directories
RUN mkdir -p /app/data /app/plugins /app/logs \
    && mkdir -p /var/log/nginx \
    && chown -R www-data:www-data /var/log/nginx

# Set environment variables
ENV ASPNETCORE_URLS=http://+:5000 \
    ASPNETCORE_ENVIRONMENT=Production

# Expose nginx port 80
EXPOSE 80

# Health check (through nginx)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Run startup script (nginx + backend)
ENTRYPOINT ["/app/start.sh"]
