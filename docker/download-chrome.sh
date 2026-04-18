#!/bin/bash

# Download Google Chrome stable deb package
# Run this script to download the latest Chrome package for Docker build

echo "Downloading Google Chrome stable deb package..."

# Create docker directory if it doesn't exist
mkdir -p docker

# Download latest stable version
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O docker/google-chrome-stable.deb

if [ $? -eq 0 ]; then
    echo "Download successful!"
    echo "Package saved to: docker/google-chrome-stable.deb"
    ls -lh docker/google-chrome-stable.deb
else
    echo "Download failed!"
    exit 1
fi
