import { Box, ButtonBase } from '@mui/material';

const LETTERS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));

interface LetterRailProps {
  /** 当前选中的字母，null 表示不筛选 */
  active: string | null;
  onSelect: (letter: string | null) => void;
}

/**
 * 右侧首字母快捷条（类似 Emby 的 A-Z 索引）。
 * 按番号首字母筛选，点「全」回到不筛选。
 */
export function LetterRail({ active, onSelect }: LetterRailProps) {
  return (
    <Box
      sx={{
        position: 'fixed',
        right: { sm: 18, md: 22 },
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 1200,
        // 小屏隐藏：横向空间不够，容易挡住内容
        display: { xs: 'none', sm: 'flex' },
        flexDirection: 'column',
        alignItems: 'center',
        py: 0.75,
        px: 0.5,
        borderRadius: 2,
        bgcolor: 'background.paper',
        boxShadow: 3,
        opacity: 0.7,
        transition: 'opacity 0.2s ease',
        '&:hover': { opacity: 1 },
      }}
    >
      <ButtonBase
        onClick={() => onSelect(null)}
        sx={{
          width: 22,
          height: 18,
          borderRadius: 0.5,
          fontSize: 11,
          color: active ? 'text.secondary' : 'primary.main',
          fontWeight: active ? 400 : 700,
        }}
      >
        全
      </ButtonBase>

      {LETTERS.map((letter) => {
        const isActive = active === letter;
        return (
          <ButtonBase
            key={letter}
            onClick={() => onSelect(letter)}
            sx={{
              width: 22,
              height: 17,
              borderRadius: 0.5,
              fontSize: 11,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? 'primary.contrastText' : 'text.secondary',
              bgcolor: isActive ? 'primary.main' : 'transparent',
              '&:hover': {
                bgcolor: isActive ? 'primary.main' : 'action.hover',
                color: isActive ? 'primary.contrastText' : 'text.primary',
              },
            }}
          >
            {letter}
          </ButtonBase>
        );
      })}
    </Box>
  );
}
