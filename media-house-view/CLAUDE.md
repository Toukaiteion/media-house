# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server with Vite HMR
- `npm run build` - Type-check and build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## Architecture Overview

This is the frontend for MediaHouse, a media center application built with React + TypeScript + Vite.

### Project Structure

- **`src/layouts/`** - Layout wrappers for routing sections
  - `MainLayout` - Primary layout with TopNavbar, Sidebar, and content area for main app routes
  - `PlayerLayout` - Minimal layout for full-screen video playback route (`/play/:id`)

- **`src/pages/`** - Page components organized by feature
  - `MediaCenter/` - Nested routes for media browsing (`/media-center/*`)
    - `OverviewPage` - Dashboard/home view
    - `MoviesPage` - Movie library view
    - `TvShowPage` - TV show library view
  - `Settings/` - Nested routes for settings (`/settings/*`)
    - `MediaLibrarySettingsPage` - Library management
    - `MetadataSettingsPage` - Metadata configuration
    - `AccountSettingsPage` - User account settings
    - `LogsManagerPage` - System logs viewer
  - `Player/PlayerPage` - Video playback component

- **`src/contexts/`** - Context providers and layout components
  - `MediaContext` - Provides libraries state and CRUD operations via `useMedia()` hook
  - `Sidebar` - Collapsible sidebar navigation that changes based on current route (media vs settings)
  - `TopNavbar` - App header with menu toggle, theme switcher, and navigation icons

- **`src/services/api.ts`** - API client singleton
  - Exports `api` instance configured with `VITE_API_BASE_URL` (defaults to `http://localhost:5249/api`)
  - Methods for libraries, movies, TV shows, seasons, episodes, playback, and scan logs

- **`src/types/index.ts`** - TypeScript interfaces for all domain models (MediaLibrary, Movie, TVShow, Season, Episode, etc.)

### Routing Architecture

The app uses nested routing with `react-router-dom`:
- `/media-center/*` routes use `MainLayout` (with sidebar/navbar)
- `/settings/*` routes use `MainLayout` (with sidebar/navbar)
- `/play/:id` uses `PlayerLayout` (full-screen, no UI chrome)

Sidebar menu items change dynamically based on the current route section.

### State Management

- **MediaContext** - Global libraries state, auto-fetches on mount, provides `refreshLibraries()`, `createLibrary()`, `deleteLibrary()`
- Theme state is managed in `main.tsx` with `localStorage` persistence

### UI Patterns

- All components use Material-UI (MUI) v7
- Dark/light theme switching with MUI ThemeProvider
- Sidebar collapses to mini drawer (240px → 60px)
- Styled components use `@mui/material/styles` styled() utility

### API Integration

The API client handles:
- Libraries (CRUD + scan triggering)
- Movies and TV Shows (CRUD + filtering by libraryId)
- Seasons and Episodes (nested under TV shows)
- Playback (URL generation + progress tracking)
- Scan logs (for libraries)
