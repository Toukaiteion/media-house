import { Card, CardContent, Avatar, Box, Typography, IconButton, styled } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';

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

interface InfoCardProps {
  title: string;
  count?: number;
  onClick?: () => void;
  avatar?: string;
  /** 是否已收藏；传了 onToggleFavorite 才会显示心形按钮 */
  favorite?: boolean;
  onToggleFavorite?: () => void;
}

export function InfoCard({ title, count, onClick, avatar, favorite, onToggleFavorite }: InfoCardProps) {
  return (
    <StyledCard
      onClick={onClick}
      sx={{
        position: 'relative',
        ...(favorite ? { borderColor: 'error.light', borderWidth: 1, borderStyle: 'solid' } : {}),
      }}
    >
      {onToggleFavorite && (
        <IconButton
          size="small"
          aria-label={favorite ? `取消收藏 ${title}` : `收藏 ${title}`}
          onClick={(event) => {
            // 点心形不要顺带跳转到筛选页
            event.stopPropagation();
            onToggleFavorite();
          }}
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            color: favorite ? 'error.main' : 'text.disabled',
            opacity: favorite ? 1 : 0.6,
            '&:hover': { opacity: 1 },
          }}
        >
          {favorite ? <FavoriteIcon fontSize="small" /> : <FavoriteBorderIcon fontSize="small" />}
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
