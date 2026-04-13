import { AppBar, IconButton, Toolbar, Typography, Box, Menu, MenuItem } from "@mui/material";
import { useLocation, useNavigate } from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';
import SettingsIcon from '@mui/icons-material/Settings';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountIcon from '@mui/icons-material/AccountCircle';
import { useState } from "react";
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import { useAuth } from './AuthContext';

interface TopNavbarProps {
  onToggleSidebar: () => void;
}

interface onToggleTheme {
  onToggleTheme: (index: number) => void;
}

export function TopNavbar({ onToggleSidebar, onToggleTheme }: TopNavbarProps & onToggleTheme) {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const isMedia = location.pathname.startsWith('/media-center');
    const isSettings = location.pathname.startsWith('/settings');

    const title = isMedia ? '媒体中心' : isSettings ? '系统设置' : 'MediaHouse';

    const savedIndex = localStorage.getItem('app-theme-index');
    const [currentThemeIndex, setCurrentThemeIndex] = useState(savedIndex ? parseInt(savedIndex, 10) : 0);
    const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);

    const switchTheme = () => {
      const nextIndex = currentThemeIndex === 0 ? 1 : 0;
      setCurrentThemeIndex(nextIndex);
      onToggleTheme(nextIndex);
    }

    const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
      setUserMenuAnchor(event.currentTarget);
    };

    const handleUserMenuClose = () => {
      setUserMenuAnchor(null);
    };

    const handleLogout = () => {
      handleUserMenuClose();
      logout();
    };

    return (
        <AppBar position="static" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
            <Toolbar>
                {/* 左侧菜单按钮 */}
                <IconButton
                    color="inherit"
                    edge="start"
                    sx={{ mr: 2 }}
                    onClick={onToggleSidebar}
                >
                    <MenuIcon />
                </IconButton>

                {/* 标题 */}
                <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                    {title}
                </Typography>

                {/* 右侧设置和用户按钮 */}
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <IconButton
                        color="inherit"
                        edge="end"
                        onClick={switchTheme}
                        sx={{ ml: 1 }}
                        aria-label="theme"
                    >
                        {currentThemeIndex === 0 ? <LightModeIcon /> : <DarkModeIcon />}
                    </IconButton>
                    
                    <IconButton
                        color="inherit"
                        edge="end"
                        onClick={() => navigate('/settings')}
                        sx={{ ml: 1 }}
                        aria-label="settings"
                    >
                        <SettingsIcon />
                    </IconButton>
                    
                    <IconButton
                        color="inherit"
                        edge="end"
                        onClick={handleUserMenuOpen}
                        aria-label="account"
                    >
                        <PersonIcon />
                    </IconButton>
                </Box>

                <Menu
                    anchorEl={userMenuAnchor}
                    open={Boolean(userMenuAnchor)}
                    onClose={handleUserMenuClose}
                    onClick={handleUserMenuClose}
                    PaperProps={{
                        sx: {
                            mt: 2,
                        }
                    }}
                >
                    <MenuItem disabled>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AccountIcon fontSize="small" />
                            <Typography variant="body2">
                                {user?.username || '用户'}
                            </Typography>
                        </Box>
                    </MenuItem>
                    <MenuItem onClick={() => navigate('/settings/account')}>
                        账户设置
                    </MenuItem>
                    <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LogoutIcon fontSize="small" />
                            退出登录
                        </Box>
                                       </MenuItem>
                </Menu>
            </Toolbar>
        </AppBar>
    );
}
