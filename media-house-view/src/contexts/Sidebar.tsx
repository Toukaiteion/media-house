import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Toolbar } from "@mui/material";
import { styled } from "@mui/material/styles";
import { useLocation, useNavigate } from "react-router-dom";
import HomeIcon from '@mui/icons-material/Home';
import MovieIcon from '@mui/icons-material/Movie';
import TvIcon from '@mui/icons-material/Tv';
import EventNoteIcon from '@mui/icons-material/EventNote';
import SourceIcon from '@mui/icons-material/Source';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import PeopleIcon from '@mui/icons-material/People';
import FavoriteIcon from '@mui/icons-material/Favorite';
import ExtensionIcon from '@mui/icons-material/Extension';

const DRAWER_WIDTH = 240;
const MINI_DRAWER_WIDTH = 60;

// 可收缩侧边栏样式
const StyledDrawer = styled(Drawer)<{ open: boolean }>(({ theme, open }) => ({
  width: open ? DRAWER_WIDTH : MINI_DRAWER_WIDTH,
  flexShrink: 0,
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',

  '& .MuiDrawer-paper': {
    width: open ? DRAWER_WIDTH : MINI_DRAWER_WIDTH,
    transition: theme.transitions.create('width', {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.complex,
    }),
    overflowX: 'hidden',
  },
}));

interface SidebarProps {
  open: boolean;
}

export function Sidebar({ open }: SidebarProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const isMedia = location.pathname.startsWith('/media-center');
    const isSettings = location.pathname.startsWith('/settings');

    const isActive = (itemPath: string, currentPath: string): boolean => {
        return currentPath === itemPath || currentPath.startsWith(itemPath + '/');
    };

    const mediaItems = [
      { title: '首页', path: '/media-center/home', icon: <HomeIcon /> },
      { title: '电影', path: '/media-center/movies', icon: <MovieIcon /> },
      { title: '电视剧', path: '/media-center/tvshows', icon: <TvIcon /> },
      { title: '我的喜欢', path: '/media-center/favorites', icon: <FavoriteIcon /> },
      { title: '标签', path: '/media-center/tags', icon: <LocalOfferIcon /> },
      { title: '演员', path: '/media-center/actors', icon: <PeopleIcon /> },
    ];

    const settingsItems = [
      { title: '首页', path: '/media-center/home', icon: <HomeIcon /> },
      { title: '媒体库', path: '/settings/media-library', icon: <MovieIcon /> },
      { title: '插件管理', path: '/settings/plugins', icon: <ExtensionIcon /> },
      { title: '元数据管理', path: '/settings/metadata', icon: <SourceIcon /> },
      { title: '账号管理', path: '/settings/account', icon: <PersonOutlineIcon /> },
      { title: '日志', path: '/settings/logs', icon: <EventNoteIcon /> },
    ]

    const currentMenu = isMedia ? mediaItems : isSettings ? settingsItems : [];

    return (
        <StyledDrawer variant="permanent" open={open}>
            <Toolbar />
            {/* 媒体中心菜单 */}
            {(
                <Box>
                <List sx={{ mt: 2 }}>
                    {currentMenu.map((item, idx) => (
                        <ListItem key={idx} disablePadding sx={{ display: 'block', cursor: 'pointer' }} onClick={() => navigate(item.path)}>
                            <ListItemButton
                                selected={isActive(item.path, location.pathname)}
                                sx={{
                                    minHeight: 48,
                                    justifyContent: open ? 'initial' : 'center',
                                    px: 2.5,
                                }}
                            >
                            <ListItemIcon
                                sx={{
                                minWidth: 0,
                                mr: open ? 2 : 'auto',
                                justifyContent: 'center',
                                }}
                            >
                                {item.icon}
                            </ListItemIcon>

                            <ListItemText
                                primary={item.title}
                                sx={{ opacity: open ? 1 : 0 }}
                            />
                            </ListItemButton>
                        </ListItem>
                    ))}
                </List>
                </Box>
            )}
        </StyledDrawer>
  )
}