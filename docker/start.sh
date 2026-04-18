#!/bin/bash
set -e

# Start Nginx in the background
echo "Starting Nginx..."
nginx

# Wait a bit for nginx to start
sleep 2

# Start the .NET backend (this will run in the foreground)
echo "Starting .NET backend on port 5000..."
exec dotnet /app/media-house-admin.dll
