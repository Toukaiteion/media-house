import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  ArrowBack as ArrowBackIcon,
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  VolumeUp as VolumeUpIcon,
  VolumeOff as VolumeOffIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const VOLUME_STORAGE_KEY = 'player_volume';
const CONTROLS_HIDE_DELAY = 3000;
const PROGRESS_REPORT_INTERVAL = 10000;
// 距离结尾小于这个秒数时视为「已看完」，下次从头开始
const FINISHED_THRESHOLD_SECONDS = 3;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// 格式化时间 00:00 / 0:00:00
const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const hour = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
  return hour > 0 ? `${hour}:${min}:${sec}` : `${min}:${sec}`;
};

export function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? 0;

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const resumeAppliedRef = useRef(false);
  const lastReportedRef = useRef(-1);
  // 卸载时 video 元素可能已经被回收，用这个记录最后一次位置
  const lastPositionRef = useRef(0);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const [volume, setVolume] = useState(() => {
    const saved = Number.parseFloat(localStorage.getItem(VOLUME_STORAGE_KEY) ?? '');
    return Number.isFinite(saved) ? clamp(saved, 0, 1) : 1;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [speedAnchor, setSpeedAnchor] = useState<HTMLElement | null>(null);

  // 拖动进度条时的临时值：拖动过程中不 seek，松手才 seek，避免每帧都触发一次
  const [seeking, setSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);

  const videoUrl = id ? `/api/media/${id}/stream` : null;

  // 片名 / 所属媒体库：媒体库 id 用来在片尾标记「已看完」
  const [movieTitle, setMovieTitle] = useState('');
  const libraryIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    api
      .getMovieDetail(id)
      .then((movie) => {
        if (cancelled) return;
        setMovieTitle(movie.title ?? '');
        const libraryId = Number.parseInt(String(movie.media_library_id ?? ''), 10);
        libraryIdRef.current = Number.isFinite(libraryId) ? libraryId : null;
      })
      .catch(() => {
        // 拿不到详情不影响播放
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  // ---------------- 控制栏自动隐藏 ----------------

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimerRef.current) {
      window.clearTimeout(hideControlsTimerRef.current);
    }
    hideControlsTimerRef.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false);
      }
    }, CONTROLS_HIDE_DELAY);
  }, []);

  // ---------------- 播放控制 ----------------

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {
        // 浏览器拦截自动播放时忽略，用户再点一次即可
      });
    } else {
      video.pause();
    }
  }, []);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const target = clamp(video.currentTime + delta, 0, video.duration || Number.MAX_SAFE_INTEGER);
    video.currentTime = target;
    setCurrentTime(target);
    showControlsTemporarily();
  }, [showControlsTemporarily]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const handleVolumeChange = useCallback((_: Event, value: number | number[]) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Array.isArray(value) ? value[0] : value;
    video.volume = next;
    video.muted = next === 0;
    setVolume(next);
    setIsMuted(next === 0);
    localStorage.setItem(VOLUME_STORAGE_KEY, String(next));
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      // 失败（比如浏览器限制）时不改状态，交给 fullscreenchange 同步
      void container.requestFullscreen().catch(() => undefined);
    }
  }, []);

  const handleSpeedOpen = (event: React.MouseEvent<HTMLElement>) => setSpeedAnchor(event.currentTarget);
  const handleSpeedClose = () => setSpeedAnchor(null);

  const changeSpeed = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
    setSpeedAnchor(null);
  }, []);

  useEffect(() => {
    return () => {
      if (hideControlsTimerRef.current) window.clearTimeout(hideControlsTimerRef.current);
      if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    };
  }, []);

  // ---------------- 进度上报 ----------------

  const reportProgress = useCallback(
    (positionOverride?: number) => {
      const video = videoRef.current;
      if (!id) return;

      const position = positionOverride ?? Math.floor(video ? video.currentTime : lastPositionRef.current);
      lastPositionRef.current = position;

      // 位置没变（或只差不到 1 秒）就不重复上报，减少无意义的写库
      if (positionOverride === undefined && Math.abs(position - lastReportedRef.current) < 1) return;

      lastReportedRef.current = position;
      void api
        .upsertPlayRecord(id, { user_id: userId, position_seconds: position })
        .catch((err) => console.warn('上报播放进度失败', err));
    },
    [id, userId],
  );

  // 定时上报
  useEffect(() => {
    if (!id) return;
    progressTimerRef.current = window.setInterval(() => reportProgress(), PROGRESS_REPORT_INTERVAL);
    return () => {
      if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    };
  }, [id, reportProgress]);

  // 页面隐藏（切标签页 / 最小化）和离开页面时补一次上报，避免丢掉最后几秒
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') reportProgress();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onVisibilityChange);
      // 组件卸载（返回列表）时保存当前位置
      reportProgress();
    };
  }, [reportProgress]);

  // ---------------- 视频事件 ----------------

  const handleLoadedMetadata = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    setDuration(video.duration || 0);
    video.volume = volume;
    video.muted = isMuted;
    video.playbackRate = playbackRate;

    // 续播位置只在首次加载元数据时应用一次
    if (resumeAppliedRef.current) return;
    resumeAppliedRef.current = true;

    if (id) {
      try {
        const record = await api.getPlayRecord(id, userId);
        const seconds = Math.floor((record.position_ms ?? 0) / 1000);
        const nearEnd = video.duration > 0 && seconds >= video.duration - FINISHED_THRESHOLD_SECONDS;

        // 上次已经看完（或位置异常）时从头开始
        if (seconds > 0 && !nearEnd) {
          video.currentTime = seconds;
          setCurrentTime(seconds);
        } else if (nearEnd) {
          video.currentTime = 0;
          setCurrentTime(0);
          reportProgress(0);
        }
      } catch {
        // 没有播放记录是正常情况，忽略
      }
    }

    try {
      await video.play();
    } catch {
      // 自动播放被浏览器拦截：停在第一帧，等用户点击
      setIsPlaying(false);
    }
  }, [id, userId, volume, isMuted, playbackRate, reportProgress]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    lastPositionRef.current = video.currentTime;
    if (seeking) return;
    setCurrentTime(video.currentTime);
  }, [seeking]);

  const handleSeekChange = (_: Event, value: number | number[]) => {
    setSeeking(true);
    setSeekValue(Array.isArray(value) ? value[0] : value);
  };

  const handleSeekCommitted = (_: Event | React.SyntheticEvent, value: number | number[]) => {
    const video = videoRef.current;
    const next = Array.isArray(value) ? value[0] : value;
    if (video) {
      video.currentTime = next;
      setCurrentTime(next);
    }
    setSeeking(false);
    setSeekValue(next);
  };

  const handleProgress = () => {
    const video = videoRef.current;
    if (!video) return;
    // 流式播放时 duration 可能后到；值没变就不触发重渲染
    setDuration((prev) => (Number.isFinite(video.duration) && video.duration > 0 && video.duration !== prev ? video.duration : prev));
  };

  // ---------------- 键盘快捷键 ----------------

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (!videoRef.current) return;

      switch (event.key) {
        case ' ':
        case 'k':
          event.preventDefault();
          togglePlay();
          showControlsTemporarily();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          seekBy(-5);
          break;
        case 'ArrowRight':
          event.preventDefault();
          seekBy(5);
          break;
        case 'ArrowUp':
          event.preventDefault();
          handleVolumeChange(event as unknown as Event, clamp((videoRef.current.volume ?? 0) + 0.1, 0, 1));
          break;
        case 'ArrowDown':
          event.preventDefault();
          handleVolumeChange(event as unknown as Event, clamp((videoRef.current.volume ?? 0) - 0.1, 0, 1));
          break;
        case 'm':
        case 'M':
          toggleMute();
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'Escape':
          if (document.fullscreenElement) void document.exitFullscreen();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, seekBy, toggleMute, toggleFullscreen, handleVolumeChange, showControlsTemporarily]);

  // 浏览器按 ESC 退出全屏时，同步图标状态
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // ---------------- 渲染 ----------------

  const handleBack = () => {
    reportProgress();
    navigate(-1);
  };

  if (!id) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'black' }}>
        <Alert severity="error">缺少媒体 ID</Alert>
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      onMouseMove={showControlsTemporarily}
      onDoubleClick={toggleFullscreen}
      sx={{
        height: '100vh',
        width: '100%',
        bgcolor: '#000',
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
        cursor: showControls ? 'default' : 'none',
      }}
    >
      {/* 视频 */}
      {!fatalError && (
        <video
          ref={videoRef}
          src={videoUrl ?? undefined}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onProgress={handleProgress}
          onPlay={() => setIsPlaying(true)}
          onPause={() => {
            setIsPlaying(false);
            reportProgress();
          }}
          onEnded={() => {
            setIsPlaying(false);
            setShowControls(true);
            const endedPosition = Math.floor(videoRef.current?.duration || 0);
            // 记录到片尾，下次打开按「已看完」从头开始
            reportProgress(endedPosition);

            // 顺便让后端把这条记录标记为已完成
            if (libraryIdRef.current !== null && id) {
              void api
                .markPlaybackCompleted({
                  media_library_id: libraryIdRef.current,
                  media_id: Number(id),
                  position_seconds: endedPosition,
                })
                .catch(() => undefined);
            }
          }}
          onClick={togglePlay}
          onError={() => {
            setIsBuffering(false);
            setFatalError('视频加载失败，文件可能已被移动或删除');
          }}
          onCanPlay={() => setIsBuffering(false)}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          playsInline
          preload="metadata"
          style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}
        />
      )}

      {/* 加载中 */}
      {isBuffering && !fatalError && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <CircularProgress sx={{ color: 'white' }} />
        </Box>
      )}

      {/* 播放失败 */}
      {fatalError && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <Alert severity="error">{fatalError}</Alert>
          <Button variant="contained" onClick={handleBack}>
            返回
          </Button>
        </Box>
      )}

      {/* 顶部返回栏 */}
      <AppBar
        position="absolute"
        sx={{
          bgcolor: 'transparent',
          boxShadow: 'none',
          background: 'linear-gradient(rgba(0,0,0,0.7), transparent)',
          opacity: showControls || fatalError ? 1 : 0,
          transition: 'opacity 0.3s',
          pointerEvents: showControls || fatalError ? 'auto' : 'none',
        }}
      >
        <Toolbar variant="dense">
          <IconButton edge="start" color="inherit" onClick={handleBack} aria-label="返回">
            <ArrowBackIcon />
          </IconButton>
          {movieTitle && (
            <Typography
              variant="subtitle1"
              noWrap
              sx={{ ml: 1, fontWeight: 500, textShadow: '0 1px 4px rgba(0,0,0,.8)' }}
            >
              {movieTitle}
            </Typography>
          )}
        </Toolbar>
      </AppBar>

      {/* 底部控制栏 */}
      {!fatalError && (
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            px: 2,
            pt: 6,
            pb: 1,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
            opacity: showControls ? 1 : 0,
            transition: 'opacity 0.3s',
            pointerEvents: showControls ? 'auto' : 'none',
          }}
        >
          <Slider
            size="small"
            value={seeking ? seekValue : currentTime}
            max={duration || 0}
            onChange={handleSeekChange}
            onChangeCommitted={handleSeekCommitted}
            sx={{ color: '#d0d0d0', height: 6, mb: 1, '& .MuiSlider-thumb': { width: 12, height: 12 } }}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton size="small" onClick={togglePlay} sx={{ color: '#fff' }} aria-label={isPlaying ? '暂停' : '播放'}>
              {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
            </IconButton>

            <Box sx={{ display: 'flex', alignItems: 'center', width: 120 }}>
              <IconButton size="small" onClick={toggleMute} sx={{ color: '#fff' }} aria-label={isMuted ? '取消静音' : '静音'}>
                {isMuted || volume === 0 ? <VolumeOffIcon /> : <VolumeUpIcon />}
              </IconButton>
              <Slider
                size="small"
                value={isMuted ? 0 : volume}
                max={1}
                step={0.01}
                onChange={handleVolumeChange}
                sx={{ color: '#fff', ml: 1 }}
              />
            </Box>

            <Typography sx={{ color: '#fff', fontSize: '0.8rem', ml: 1, fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(seeking ? seekValue : currentTime)} / {formatTime(duration)}
            </Typography>

            <Box sx={{ flexGrow: 1 }} />

            <Tooltip title="播放速度">
              <IconButton size="small" onClick={handleSpeedOpen} sx={{ color: '#fff' }} aria-label="播放速度">
                <SpeedIcon />
              </IconButton>
            </Tooltip>
            <Menu anchorEl={speedAnchor} open={Boolean(speedAnchor)} onClose={handleSpeedClose}>
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                <MenuItem key={rate} onClick={() => changeSpeed(rate)} selected={playbackRate === rate}>
                  {rate}x
                </MenuItem>
              ))}
            </Menu>

            <IconButton size="small" onClick={toggleFullscreen} sx={{ color: '#fff' }} aria-label={isFullscreen ? '退出全屏' : '全屏'}>
              {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
          </Box>
        </Box>
      )}
    </Box>
  );
}
