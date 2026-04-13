import { useState, useEffect } from 'react';
import {
  Dialog,
  Box,
  IconButton,
  Typography,
  Fade,
} from '@mui/material';
import {
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  Close as CloseIcon,
} from '@mui/icons-material';

interface ImageViewerProps {
  images: string[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

export function ImageViewer({ images, initialIndex, open, onClose }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Reset index when images change
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, images]);

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!open) return;

    switch (event.key) {
      case 'ArrowLeft':
        handlePrevious();
        break;
      case 'ArrowRight':
        handleNext();
        break;
      case 'Escape':
        onClose();
        break;
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handlePrevious, handleNext, onClose]);

  const currentImage = images[currentIndex];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'rgba(0, 0, 0, 0.95)',
          m: 0,
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
      }}
      TransitionComponent={Fade}
    >
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Previous button */}
        <IconButton
          onClick={handlePrevious}
          sx={{
            position: 'absolute',
            left: 16,
            top: '50%',
            transform: 'translateY(-50%)',
            bgcolor: 'rgba(255, 255, 255, 0.1)',
            color: 'white',
            '&:hover': {
              bgcolor: 'rgba(255, 255, 255, 0.3)',
            },
            zIndex: 1,
          }}
          size="large"
        >
          <PrevIcon />
        </IconButton>

        {/* Image */}
        <Box
          component="img"
          src={currentImage}
          alt={`Screenshot ${currentIndex + 1}`}
          sx={{
            maxWidth: 'calc(100% - 120px)',
            maxHeight: 'calc(100% - 80px)',
            objectFit: 'contain',
            borderRadius: 1,
          }}
        />

        {/* Next button */}
        <IconButton
          onClick={handleNext}
          sx={{
            position: 'absolute',
            right: 16,
            top: '50%',
            transform: 'translateY(-50%)',
            bgcolor: 'rgba(255, 255, 255, 0.1)',
            color: 'white',
            '&:hover': {
              bgcolor: 'rgba(255, 255, 255, 0.3)',
            },
            zIndex: 1,
          }}
          size="large"
        >
          <NextIcon />
        </IconButton>

        {/* Close button */}
        <IconButton
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 16,
            top: 16,
            bgcolor: 'rgba(255, 255, 255, 0.1)',
            color: 'white',
            '&:hover': {
              bgcolor: 'rgba(255, 255, 255, 0.3)',
            },
            zIndex: 1,
          }}
          size="large"
        >
          <CloseIcon />
        </IconButton>

        {/* Counter */}
        <Typography
          variant="body1"
          sx={{
            position: 'absolute',
            bottom: 24,
            color: 'white',
            bgcolor: 'rgba(0, 0, 0, 0.5)',
            px: 2,
            py: 1,
            borderRadius: 1,
          }}
        >
          {currentIndex + 1} / {images.length}
        </Typography>
      </Box>
    </Dialog>
  );
}
