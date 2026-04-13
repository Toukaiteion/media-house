import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { MediaCenter } from './pages/MediaCenter';
import { OverviewPage } from './pages/MediaCenter/OverviewPage';
import { MoviesPage } from './pages/MediaCenter/MoviesPage';
import { MovieDetailPage } from './pages/MediaCenter/MovieDetailPage';
import { TvShowsPage } from './pages/MediaCenter/TvShowPage';
import { TagsPage } from './pages/MediaCenter/TagsPage';
import { ActorsPage } from './pages/MediaCenter/ActorsPage';
import { FavoritesPage } from './pages/MediaCenter/FavoritesPage';
import { Settings } from './pages/Settings';
import { MediaLibrarySettingsPage } from './pages/Settings/MediaLibrarySettingsPage';
import { MetadataSettingsPage } from './pages/Settings/MetadataSettingsPage';
import { AccountSettingsPage } from './pages/Settings/AccountSettingsPage';
import { LogsManagerPage } from './pages/Settings/LogsManagerPage';
import { PluginSettingsPage } from './pages/Settings/PluginSettingsPage';
import { PlayerLayout } from './layouts/PlayerLayout';
import { PlayerPage } from './pages/Player/PlayerPage';
import { LoginPage } from './pages/Login/LoginPage';
import { RegisterPage } from './pages/Register/RegisterPage';
import { PrivateRoute } from './components/PrivateRoute';

interface AppProps {
  toggleTheme: (index: number) => void;
}
function App({ toggleTheme }: AppProps) {
  return (
    <div>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<PrivateRoute />}>
          <Route element={<MainLayout toggleTheme={toggleTheme} />}>
            <Route path="/media-center" element={<MediaCenter />} >
              <Route index element={<OverviewPage />} />
              <Route path="home" element={<OverviewPage />} />
              <Route path="movies" element={<MoviesPage />} />
              <Route path="movies/:id" element={<MovieDetailPage />} />
              <Route path="tvshows" element={<TvShowsPage />} />
              <Route path="favorites" element={<FavoritesPage />} />
              <Route path="tags" element={<TagsPage />} />
              <Route path="actors" element={<ActorsPage />} />
            </Route>
            <Route path="/settings" element={<Settings />} >
              <Route index element={<MediaLibrarySettingsPage />} />
              <Route path="media-library" element={<MediaLibrarySettingsPage />} />
              <Route path="plugins" element={<PluginSettingsPage />} />
              <Route path="metadata" element={<MetadataSettingsPage />} />
              <Route path="account" element={<AccountSettingsPage />} />
              <Route path="logs" element={<LogsManagerPage />} />
            </Route>
          </Route>
          <Route path="/play/:id" element={<PlayerLayout />} >
            <Route index element={<PlayerPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </div>


  );
}

export default App;
