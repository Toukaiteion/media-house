# Multi-stage Dockerfile for MediaHouse - Frontend (React+Vite) + Backend (.NET 10.0)

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

# Install system dependencies including Chrome
RUN apt-get update && apt-get install -y \
    # Chrome dependencies
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
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
    # Other useful tools
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Chrome (stable)
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
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

# Create necessary directories
RUN mkdir -p /app/data /app/plugins /app/logs

# Set environment variables
ENV ASPNETCORE_URLS=http://+:80 \
    ASPNETCORE_ENVIRONMENT=Production

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Run the application
ENTRYPOINT ["dotnet", "media-house-admin.dll"]
