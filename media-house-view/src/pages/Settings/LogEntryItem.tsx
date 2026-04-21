import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Collapse,
  IconButton,
  Chip,
  Tooltip,
  Divider
} from '@mui/material';
import {
  ExpandMore,
  ExpandLess,
  Code,
  Info,
  Warning as WarningIcon,
  Error as ErrorIcon,
  BugReport
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import { type LogEntry, type LogLevel } from '../../types';

const LogPaper = styled(Paper, {
  shouldForwardProp: (prop) => prop !== 'level'
})<{ level: LogLevel }>(({ level, theme }) => {
  const colors = {
    Error: {
      bg: theme.palette.error.main + '10',
      border: theme.palette.error.main + '40'
    },
    Warning: {
      bg: theme.palette.warning.main + '10',
      border: theme.palette.warning.main + '40'
    },
    Information: {
      bg: theme.palette.info.main + '10',
      border: theme.palette.info.main + '40'
    },
    Debug: {
      bg: theme.palette.grey[50],
      border: theme.palette.grey[300]
    },
    Fatal: {
      bg: theme.palette.error.dark + '20',
      border: theme.palette.error.dark + '60'
    }
  };

  return {
    marginBottom: theme.spacing(1),
    backgroundColor: colors[level]?.bg || colors.Information.bg,
    borderLeft: `3px solid ${colors[level]?.border || colors.Information.border}`,
    '&:hover': {
      backgroundColor: colors[level]?.bg + '80' || colors.Information.bg + '80'
    }
  };
});

const TimestampText = styled(Typography)(({ theme }) => ({
  fontFamily: 'monospace',
  fontSize: '0.75rem',
  color: theme.palette.text.secondary,
  minWidth: '160px'
}));

const getLevelIcon = (level: LogLevel) => {
  switch (level) {
    case 'Error':
      return <ErrorIcon fontSize="small" color="error" />;
    case 'Warning':
      return <WarningIcon fontSize="small" color="warning" />;
    case 'Debug':
      return <BugReport fontSize="small" color="secondary" />;
    case 'Fatal':
      return <ErrorIcon fontSize="small" color="error" />;
    default:
      return <Info fontSize="small" color="info" />;
  }
};

const getLevelColor = (level: LogLevel) => {
  switch (level) {
    case 'Error':
      return 'error';
    case 'Warning':
      return 'warning';
    case 'Debug':
      return 'default';
    case 'Fatal':
      return 'error';
    default:
      return 'info';
  }
};

interface LogEntryItemProps {
  log: LogEntry;
  index: number;
}

export function LogEntryItem({ log }: LogEntryItemProps) {
  const [expanded, setExpanded] = useState(false);

  const hasDetails = log.exception || log.properties || log.sourceContext || log.messageTemplate || log.key_id || log.event_id;
  const timestamp = new Date(log.timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  });

  const parseProperties = () => {
    if (!log.properties) return null;
    try {
      return JSON.parse(log.properties);
    } catch {
      return log.properties;
    }
  };

  const properties = parseProperties();

  return (
    <LogPaper level={log.level} elevation={0}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          padding: 1,
          cursor: hasDetails ? 'pointer' : 'default'
        }}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
          <TimestampText>{timestamp}</TimestampText>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
          {getLevelIcon(log.level)}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', mr: 1, minWidth: '80px' }}>
          <Chip
            label={log.level}
            size="small"
            color={getLevelColor(log.level) as any}
            variant="outlined"
          />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" noWrap>
            {log.message}
          </Typography>
        </Box>

        {hasDetails && (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </IconButton>
        )}
      </Box>

      <Collapse in={expanded}>
        <Divider />
        <Box sx={{ p: 2 }}>
          {log.sourceContext && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Source:
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {log.sourceContext}
              </Typography>
            </Box>
          )}

          {log.messageTemplate && log.messageTemplate !== log.message && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Template:
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                { log.messageTemplate }
              </Typography>
            </Box>
          )}

          {properties && (
            <Box sx={{ mb: 1 }}>
              <Tooltip title={typeof properties === 'object' ? JSON.stringify(properties, null, 2) : properties}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                    Properties:
                  </Typography>
                  <IconButton size="small">
                    <Code fontSize="small" />
                  </IconButton>
                </Box>
              </Tooltip>
              <Box
                component="pre"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  mt: 0.5,
                  p: 1,
                  bgcolor: 'background.paper',
                  borderRadius: 1,
                  overflow: 'auto',
                  maxHeight: '200px'
                }}
              >
                {typeof properties === 'object' ? JSON.stringify(properties, null, 2) : properties}
              </Box>
            </Box>
          )}

          {log.exception && (
            <Box>
              <Typography variant="caption" color="error" sx={{ display: 'block', mb: 0.5 }}>
                Exception:
              </Typography>
              <Box
                component="pre"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  p: 1,
                  bgcolor: 'error.dark',
                  color: 'error.contrastText',
                  borderRadius: 1,
                  overflow: 'auto',
                  maxHeight: '300px'
                }}
              >
                {log.exception}
              </Box>
            </Box>
          )}

          {log.machineName && (
            <Box sx={{ mt: 1, display: 'flex', gap: 2 }}>
              {log.machineName && (
                <Typography variant="caption" color="text.secondary">
                  Machine: {log.machineName}
                </Typography>
              )}
              {log.threadId && (
                <Typography variant="caption" color="text.secondary">
                  Thread: {log.threadId}
                </Typography>
              )}
              {log.application && (
                <Typography variant="caption" color="text.secondary">
                  App: {log.application}
                </Typography>
              )}
            </Box>
          )}

          {log.key_id && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Key ID: {log.key_id}
              </Typography>
            </Box>
          )}

          {log.event_id && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Event ID: {log.event_id.id} ({log.event_id.name})
              </Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </LogPaper>
  );
}
