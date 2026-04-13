import { Card, CardContent, Avatar, Box, Typography, styled } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';

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
}

export function InfoCard({ title, count, onClick, avatar }: InfoCardProps) {
  return (
    <StyledCard onClick={onClick}>
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
