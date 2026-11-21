@echo off
chcp 65001 >nul
node "%~dp0scraper\batch-menu.mjs"
if errorlevel 1 pause
