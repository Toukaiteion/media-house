import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  styled,
} from '@mui/material';
import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon } from '@mui/icons-material';
import { api } from '../../services/api';
import { OverviewLibraryCard } from '../../components/OverviewLibraryCard';
import { OverviewMovieCard } from '../../components/OverviewMovieCard';
import type { MediaLibrary, MovieDetail, TagRecommendation, ActorRecommendation } from '../../types';

const ScrollContainer = styled(Box)({
  display: 'flex',
  flexWrap: 'nowrap',
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollbarWidth: 'none',
  gap: 2,
  padding: '4px',
  '&::-webkit-scrollbar': {
    display: 'none',
  },
  '&::-ms-overflow-style': {
    display: 'none',
  },
  '&scrollbar-width': {
    display: 'none',
  },
});

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [containerHeight, setContainerHeight] = useState(0);

  const checkScrollPosition = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth, scrollHeight } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth);
      setContainerHeight(scrollHeight);
    }
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScrollPosition);
      checkScrollPosition();
      const observer = new ResizeObserver(checkScrollPosition);
      observer.observe(container);

      return () => {
        container.removeEventListener('scroll', checkScrollPosition);
        observer.disconnect();
      };
    }
  }, []);

  useEffect(() => {
    checkScrollPosition();
  }, [children]);

  const handleScrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const handleScrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  const ScrollButton = ({ direction, onClick, ariaLabel }: { direction: 'left' | 'right', onClick: () => void, ariaLabel: string }) => (
    <Box
      onClick={onClick}
      sx={{
        position: 'absolute',
        left: direction === 'left' ? 0 : 'auto',
        right: direction === 'right' ? 0 : 'auto',
        borderRadius: '10px',
        top: 0,
        height: containerHeight,
        width: 66,
        bgcolor: 'rgba(0, 0, 0, 0.2)',
        opacity: hovered ? 1 : 0,
        transition: 'opacity 0.2s ease-in-out, height 0.2s ease-in-out',
        zIndex: 20,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        '&:hover': {
          bgcolor: 'rgba(0, 0, 0, 0.3)',
        },
      }}
      aria-label={ariaLabel}
    >
      {direction === 'left' ? (
        <ChevronLeftIcon sx={{ color: 'white' }} />
      ) : (
        <ChevronRightIcon sx={{ color: 'white' }} />
      )}
    </Box>
  );

  return (
    <Box
      sx={{ mb: 4 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2, px: 1 }}>
        {title}
      </Typography>

      <Box sx={{ position: 'relative' }}>
        {canScrollLeft && (
          <ScrollButton
            direction="left"
            onClick={handleScrollLeft}
            ariaLabel="向左滚动"
          />
        )}

        <ScrollContainer ref={scrollContainerRef}>
          {children}
        </ScrollContainer>

        {canScrollRight && (
          <ScrollButton
            direction="right"
            onClick={handleScrollRight}
            ariaLabel="向右滚动"
          />
        )}
      </Box>
    </Box>
  );
}

export function OverviewPage() {
  const [libraries, setLibraries] = useState<MediaLibrary[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<MovieDetail[]>([]);
  const [recentlyUpdated, setRecentlyUpdated] = useState<MovieDetail[]>([]);
  const [tagRecommendations, setTagRecommendations] = useState<TagRecommendation[]>([]);
  const [actorRecommendations, setActorRecommendations] = useState<ActorRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLibraries = async () => {
    try {
      const data = await api.getLibraries();
      setLibraries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load libraries');
    }
  };

  const loadRecentlyPlayed = async () => {
    try {
      const data = await api.getMoviesWithParams({
        sortBy: 'mostly_play',
        page: 1,
        pageSize: 20,
        sortOrder: 'desc',
      });
      setRecentlyPlayed(data.items);
    } catch (err) {
      console.error('Failed to load recently played:', err);
    }
  };

  const loadRecentlyUpdated = async () => {
    try {
      const data = await api.getMoviesWithParams({
        sortBy: 'create_time',
        page: 1,
        pageSize: 20,
        sortOrder: 'desc',
      });
      setRecentlyUpdated(data.items);
    } catch (err) {
      console.error('Failed to load recently updated:', err);
    }
  };

  const loadTagRecommendations = async () => {
    try {
      const data = await api.recommendByTags({ tagNum: 3, mediaNum: 5, mediaSearchType: 'create_time' });
      setTagRecommendations(data);
    } catch (err) {
      console.error('Failed to load tag recommendations:', err);
    }
  };

  const loadActorRecommendations = async () => {
    try {
      const data = await api.recommendByActors({ tagNum: 3, mediaNum: 5, mediaSearchType: 'create_time' });
      setActorRecommendations(data);
    } catch (err) {
      console.error('Failed to load actor recommendations:', err);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      loadLibraries(),
      loadRecentlyPlayed(),
      loadRecentlyUpdated(),
      loadTagRecommendations(),
      loadActorRecommendations(),
    ]).finally(() => {
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>加载中...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Section title="媒体库">
        {libraries.map((library: MediaLibrary) => (
          <OverviewLibraryCard key={library.id} library={library} />
        ))}
      </Section>

      <Section title="最近播放">
        {recentlyPlayed.map((movie: MovieDetail) => (
          <OverviewMovieCard key={movie.id} movie={movie} />
        ))}
      </Section>

      <Section title="最近更新">
        {recentlyUpdated.map((movie: MovieDetail) => (
          <OverviewMovieCard key={movie.id} movie={movie} />
        ))}
      </Section>

      {tagRecommendations.map((group) => (
        <Section key={`tag-${group.id}`} title={`你喜欢的标签 - ${group.tag_name}`}>
          {group.movies.map((movie: MovieDetail) => (
            <OverviewMovieCard key={movie.id} movie={movie} />
          ))}
        </Section>
      ))}

      {actorRecommendations.map((group) => (
        <Section key={`actor-${group.id}`} title={`你喜欢的演员 - ${group.name}`}>
          {group.movies.map((movie: MovieDetail) => (
            <OverviewMovieCard key={movie.id} movie={movie} />
          ))}
        </Section>
      ))}
    </Box>
  );
}
