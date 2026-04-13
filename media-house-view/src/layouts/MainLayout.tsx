import { Outlet } from 'react-router-dom';
import {
  Box
} from '@mui/material';
import { TopNavbar } from '../contexts/TopNavbar';
import { Sidebar } from '../contexts/Sidebar';
import { styled } from '@mui/material/styles';
import { useState } from 'react';

interface toggleTheme {
  toggleTheme: (index: number) => void;
}

// 主内容区：根据侧边栏状态自动缩进
const MainContent = styled(Box)<{ open: boolean }>(({ theme, open }) => ({
  flexGrow: 1,
  minWidth: 0,  // 防止 flex 子元素溢出
  width: open ? `calc(100% - 240px)` : `calc(100% - 60px)`,
  overflow: 'auto', // 允许垂直滚动

  transition: theme.transitions.create('width', {
      easing: theme.transitions.easing.easeInOut,
      duration: theme.transitions.duration.complex,
    }),
}));

export function MainLayout({ toggleTheme }: toggleTheme) {

  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* 顶部导航 */}
      <TopNavbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} onToggleTheme={toggleTheme} />

      {/* 侧边栏 + 内容 */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar open={sidebarOpen} />
        <MainContent open={sidebarOpen}> 
            <Outlet />
        </MainContent>
      </Box>
    </Box>
  );
}
