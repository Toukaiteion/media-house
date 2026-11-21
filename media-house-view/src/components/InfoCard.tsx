import { useState } from 'react';
import { Card, CardContent, Avatar, Box, Typography, IconButton, styled, keyframes } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import BookmarkAddedIcon from '@mui/icons-material/BookmarkAdded';

/** 收藏对象的类型，决定用哪个图标：影片=心形、演员=关注、标签=书签 */
export type FavoriteKind = 'movie' | 'actor' | 'tag';

const StyledCard = styled(Card)(({ theme }) => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  cursor: 'pointer',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: theme.shadows[8],
  },
}));

const StyledAvatar = styled(Avatar)(({ theme }) => ({
  width: 60,
  height: 60,
  marginBottom: theme.spacing(2),
}));

// 点收藏时的小回弹，比单纯变色更有反馈感
const popKeyframes = keyframes`
  0%   { transform: scale(1); }
  50%  { transform: scale(1.3); }
  100% { transform: scale(1); }
`;

const kindColor = (kind: FavoriteKind) => {
  switch (kind) {
    case 'actor':
      return 'secondary.main'; // 演员 = 关注，用紫色系
    case 'tag':
      return 'warning.main'; // 标签 = 订阅，用琥珀色系
    default:
      return 'error.main'; // 影片 = 喜欢，红色
  }
};

function FavoriteStateIcon({ kind, active }: { kind: FavoriteKind; active?: boolean }) {
  if (kind === 'actor') {
    return active ? <HowToRegIcon fontSize="small" /> : <PersonAddAlt1Icon fontSize="small" />;
  }
  if (kind === 'tag') {
    return active ? <BookmarkAddedIcon fontSize="small" /> : <BookmarkAddOutlinedIcon fontSize="small" />;
  }
  return active ? <FavoriteIcon fontSize="small" /> : <FavoriteBorderIcon fontSize="small" />;
}

interface InfoCardProps {
  title: string;
  count?: number;
  onClick?: () => void;
  avatar?: string;
  /** 是否已收藏；传了 onToggleFavorite 才会显示收藏按钮 */
  favorite?: boolean;
  onToggleFavorite?: () => void;
  /** 收藏按钮的图标语义，默认按标签处理 */
  favoriteKind?: FavoriteKind;
}

export function InfoCard({
  title,
  count,
  onClick,
  avatar,
  favorite,
  onToggleFavorite,
  favoriteKind = 'tag',
}: InfoCardProps) {
  const [popping, setPopping] = useState(false);
  const color = kindColor(favoriteKind);

  return (
    <StyledCard
      onClick={onClick}
      sx={{
        position: 'relative',
        ...(favorite ? { borderColor: color, borderWidth: 1, borderStyle: 'solid' } : {}),
      }}
    >
      {onToggleFavorite && (
        <IconButton
          size="small"
          aria-label={
            favorite
              ? `取消${favoriteKind === 'actor' ? '关注' : '收藏'} ${title}`
              : `${favoriteKind === 'actor' ? '关注' : '收藏'} ${title}`
          }
          onClick={(event) => {
            // 点收藏按钮不要顺带跳转到筛选页
            event.stopPropagation();
            setPopping(true);
            onToggleFavorite();
          }}
          onAnimationEnd={() => setPopping(false)}
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            color: favorite ? color : 'text.disabled',
            // 未收藏时降低存在感，hover 卡片才完全显现
            opacity: favorite ? 1 : 0.3,
            transition: 'opacity 0.15s ease, color 0.15s ease',
            '.MuiCard-root:hover &': { opacity: 1 },
            animation: popping ? `${popKeyframes} 220ms ease` : 'none',
          }}
        >
          <FavoriteStateIcon kind={favoriteKind} active={favorite} />
        </IconButton>
      )}

      <CardContent sx={{ textAlign: 'center', p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          {avatar ? (
            <StyledAvatar src={avatar} alt={title} />
          ) : (
            <StyledAvatar>
              <PersonIcon />
            </StyledAvatar>
          )}
        </Box>
        <Typography variant="h6" component="h3" noWrap sx={{ mb: 1 }}>
          {title}
        </Typography>
        {count !== undefined && (
          <Typography variant="body2" color="text.secondary">
            {count} 部媒体
          </Typography>
        )}
      </CardContent>
    </StyledCard>
  );
}
