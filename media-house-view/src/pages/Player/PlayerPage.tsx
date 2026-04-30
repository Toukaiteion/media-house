import { useState, useEffect, useRef } from 'react';
import {
  Box,
  CircularProgress,
  Alert,
  IconButton,
  Typography,
  AppBar,
  Toolbar,
  Button,
  Slider,
  Menu,
  Tooltip,
  MenuItem,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  PlayArrow as PlayArrowIcon, 
  Pause as PauseIcon, 
  VolumeUp as VolumeUpIcon, 
  VolumeOff as VolumeOffIcon, 
  Fullscreen as FullscreenIcon, 
  FullscreenExit as FullscreenExitIcon, 
  Speed as SpeedIcon 
} from '@mui/icons-material';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const VOLUME_STORAGE_KEY = 'player_volume';

// 格式化时间 00:00
const formatTime = (seconds: number) => {
  if (isNaN(seconds)) return '00:00';
  const hour = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
  return hour > 0 ? `${hour}:${min}:${sec}` : `${min}:${sec}`;
}

export function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const progressUpdateTimerRef = useRef<number | null>(null);
  const userId = user?.id || 1;

  const [mediaId, setMediaId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

    // 状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem(VOLUME_STORAGE_KEY);
    return saved ? parseFloat(saved) : 1;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [speedAnchor, setSpeedAnchor] = useState(null);

  let hideControlsTimer: any;

  // 显示控制器
  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(hideControlsTimer);
    hideControlsTimer = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  // 播放/暂停
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  // 进度改变
  const handleTimeChange = (_: any, newValue: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = newValue;
    setCurrentTime(newValue);
  };

  // 音量改变
  const handleVolumeChange = (_: any, newValue: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = newValue;
    setVolume(newValue);
    setIsMuted(newValue === 0);
    localStorage.setItem(VOLUME_STORAGE_KEY, newValue.toString());
  };

  // 静音切换
  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  // 全屏
  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // 倍速
  const handleSpeedOpen = (e: any) => setSpeedAnchor(e.currentTarget);
  const handleSpeedClose = () => setSpeedAnchor(null);
  const changeSpeed = (rate:any) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
    handleSpeedClose();
  };

  // 清理定时器
  useEffect(() => {
    return () => clearTimeout(hideControlsTimer);
  }, []);


  // 处理视频元数据加载
  const handleLoadedMetadata = () => {
    // 如果有播放记录，设置播放位置
    // 获取播放记录
    if (!mediaId) return;
    if (!videoRef.current) return;
    try {
      api.getPlayRecord(mediaId, userId).then(record => {
        const positionSeconds = Math.floor(record.position_ms / 1000);
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.currentTime = positionSeconds;
          }
        }, 100);
      });
    } catch (err) {
      console.log('No play record found:', err);
      updatePlayProgress();
    }
    setDuration(videoRef.current.duration);
    videoRef.current.volume = volume;
    videoRef.current.play();
    setIsPlaying(true);
  };

  // 处理时间更新
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // 处理视频加载完成
  const handleLoadStart = () => {
    setLoading(false);
  };

  // 初始化加载
  useEffect(() => {
    if (!id) {
      setError('缺少媒体 ID');
      setLoading(false);
      return;
    }

    setMediaId(id);

    const initializePlayer = async () => {
      try {
        setLoading(true);
        setError(null);
        setVideoUrl(`/api/media/${id}/stream`);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
      }
    };

    initializePlayer();
  }, [id]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const video = videoRef.current;
      if (!video) return;

      // 左箭头 ←
      if (e.key === 'ArrowLeft') {
        video.currentTime = Math.max(0, video.currentTime - 5);
        e.preventDefault(); // 防止页面左右滚动
      }

      // 右箭头 →
      if (e.key === 'ArrowRight') {
        video.currentTime = Math.min(video.duration, video.currentTime + 5);
        e.preventDefault();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 上报播放进度的函数
  const updatePlayProgress = () => {
    if (!mediaId || !videoRef.current) return;
    try {
      api.upsertPlayRecord(mediaId, {
        user_id: userId,
        position_seconds: Math.floor(videoRef.current.currentTime),
      });
    } catch (err) {
      console.error('Failed to update play progress:', err);
    }
  };

  // 定时更新播放进度
  useEffect(() => {
    progressUpdateTimerRef.current = window.setInterval(() => {
      updatePlayProgress();
    }, 10000);

    return () => {
      if (progressUpdateTimerRef.current) {
        clearInterval(progressUpdateTimerRef.current);
      }
    };
  }, [mediaId]);


  const handleBack = () => {
    navigate(-1);
  };

  return (
    <Box sx={{ height: '100vh', bgcolor: 'black', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部导航栏 */}
      <AppBar position="absolute" sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={handleBack}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, ml: 2 }}>
            播放
          </Typography>
        </Toolbar>
      </AppBar>

      {/* 视频容器 */}
      <Box
        ref={containerRef}
        sx={{
          width: '100%',
          margin: '0 auto',
          bgcolor: '#000',
          borderRadius: 2,
          position: 'relative',
          userSelect: 'none'
        }}
        onMouseMove={handleMouseMove}
      > 
        {/* // 加载状态 */}
        {loading && (
          <Box sx={{ 
            width: '100%',
            height: '100vh',  // 关键：让父盒子全屏
            position: 'relative',  // 关键：让子元素绝对定位基于它
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            bgcolor: '#000', // 你可以自己改背景
          }}>
            <CircularProgress sx={{ color: 'white' }} />
          </Box>
        )}
        {/* // 错误状态 */}
        {error && (
          <Box sx={{ 
            width: '100%',
            height: '100vh',  // 关键：让父盒子全屏
            position: 'relative',  // 关键：让子元素绝对定位基于它
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            bgcolor: '#000', // 你可以自己改背景
          }}>
            <Box sx={{ textAlign: 'center', maxWidth: 400 }}>
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
              <Button onClick={handleBack} variant="contained">
                返回
              </Button>
            </Box>
          </Box>
          
        )}

        {videoUrl && !error && (
          <video
            ref={videoRef}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onLoadStart={handleLoadStart}
            onClick={togglePlay}
            style={{ display: 'block', height: '100vh', margin: '0 auto' }}
          >
            <source src={videoUrl} type="video/mp4" />
          </video>
        )}
      </Box>

      {/* 播放信息 */}
      {!loading && !error && duration > 0 && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
            padding: '10px 16px',
            transition: 'opacity 0.3s',
            opacity: showControls ? 1 : 0,
          }}
          onMouseMove={(e) => {
            e.stopPropagation();
            setShowControls(true);
            clearTimeout(hideControlsTimer);
          }}
          onMouseLeave={() => {
            hideControlsTimer = setTimeout(() => {
              if (isPlaying) setShowControls(false);
            }, 3000);
          }}
        >
          {/* 进度条 */}
          <Slider
            size="small"
            value={currentTime}
            max={duration || 100}
            onChange={handleTimeChange}
            sx={{
              color: '#d0d0d0',
              height: 6,
              marginBottom: 1
            }}
          />

          {/* 按钮栏 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton size="small" onClick={togglePlay} sx={{ color: '#fff' }}>
              {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
            </IconButton>

            {/* 音量 */}
            <Box sx={{ display: 'flex', alignItems: 'center', width: 120 }}>
              <IconButton size="small" onClick={toggleMute} sx={{ color: '#fff' }}>
                {isMuted ? <VolumeOffIcon /> : <VolumeUpIcon />}
              </IconButton>
              <Slider
                size="small"
                value={isMuted ? 0 : volume}
                max={1}
                step={0.01}
                onChange={handleVolumeChange}
                sx={{ color: '#fff', marginLeft: 1 }}
              />
            </Box>

            {/* 时间 */}
            <Typography sx={{ color: '#fff', fontSize: '0.8rem', marginLeft: 1 }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </Typography>

            <Box sx={{ flexGrow: 1 }} />

            {/* 倍速 */}
            <Tooltip title="播放速度">
              <IconButton size="small" onClick={handleSpeedOpen} sx={{ color: '#fff' }}>
                <SpeedIcon />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={speedAnchor}
              open={Boolean(speedAnchor)}
              onClose={handleSpeedClose}
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                <MenuItem
                  key={rate}
                  onClick={() => changeSpeed(rate)}
                  selected={playbackRate === rate}
                >
                  {rate}x
                </MenuItem>
              ))}
            </Menu>

            {/* 全屏 */}
            <IconButton size="small" onClick={toggleFullscreen} sx={{ color: '#fff' }}>
              {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
          </Box>
        </Box>
      )}
    </Box>
  );
}
