import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useNavigate } from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext';
import { api } from './services/api';
import './index.css'

// React Query 配置
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,  // 5分钟内数据视为新鲜
      gcTime: 30 * 60 * 1000,    // 30分钟后清理缓存
    },
  },
});

const theme = createTheme({
  palette: {
    mode: 'dark',
  },
});

const lightTheme = createTheme({
  palette: {
    mode: 'light',
  },
});

const themes = [theme, lightTheme];

function AuthAwareRoot() {
  const navigate = useNavigate();

  useEffect(() => {
    api.setAuthRedirect(() => {
      localStorage.removeItem('auth-token');
      localStorage.removeItem('auth-user');
      navigate('/login');
    });
  }, [navigate]);

  return <Root />;
}

function Root() {
  const [themeIndex, setThemeIndex] = useState(() => {
    const savedIndex = localStorage.getItem('app-theme-index');
    return savedIndex ? parseInt(savedIndex) : 0;
  });

  useEffect(() => {
    localStorage.setItem('app-theme-index', String(themeIndex));
    document.documentElement.setAttribute('data-theme', themeIndex === 0 ? 'dark' : 'light');
  }, [themeIndex]);

  const toggleTheme = (index: number) => {
    index = index % themes.length;
    setThemeIndex(index);
  };

  return (
    <ThemeProvider theme={themes[themeIndex]}>
      <CssBaseline />
      <App toggleTheme={toggleTheme} />
    </ThemeProvider>
  );
}


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthAwareRoot />
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
