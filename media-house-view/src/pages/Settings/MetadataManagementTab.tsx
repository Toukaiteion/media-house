import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Container,
  Typography,
  Box,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  ListItemAvatar,
  Avatar,
  TablePagination,
} from '@mui/material';
import { Search as SearchIcon, Edit as EditIcon, Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { api } from '../../services/api';
import type { MovieDetail, MovieListParams, UpdateMetadataDto } from '../../types';

const DEFAULT_ROWS_PER_PAGE = 10;

interface ActorInfo {
  name: string;
  sortOrder: number;
}

export function MetadataManagementTab() {
  const [movies, setMovies] = useState<MovieDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE);
  const [searchValue, setSearchValue] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<MovieDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formSummary, setFormSummary] = useState('');
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formActors, setFormActors] = useState<ActorInfo[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [actorInput, setActorInput] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMovies = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: MovieListParams = {
        page: page + 1,
        pageSize: rowsPerPage,
        search: searchValue || undefined,
        sortBy: 'create_time',
        sortOrder: 'desc',
      };
      const data = await api.getMoviesWithParams(params);
      setMovies(data.items);
      setTotal(data.total_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, searchValue]);

  useEffect(() => {
    setPage(0);
  }, [searchValue]);

  useEffect(() => {
    loadMovies();
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setSearchValue(value);
    }, 500);
  }, []);

  const handleOpenEditDialog = (movie: MovieDetail) => {
    setSelectedMovie(movie);
    setFormTitle(movie.title);
    setFormSummary(movie.overview || '');
    setFormTags(movie.tags?.map(t => t.tag_name) || []);
    setFormActors(movie.actors?.map((a, idx) => ({
      name: a.name,
      sortOrder: idx,
    })) || []);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedMovie(null);
    setTagInput('');
    setActorInput('');
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formTags.includes(tagInput.trim())) {
      setFormTags([...formTags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleDeleteTag = (tag: string) => {
    setFormTags(formTags.filter(t => t !== tag));
  };

  const handleAddActor = () => {
    if (actorInput.trim() && !formActors.find(a => a.name === actorInput.trim())) {
      setFormActors([...formActors, {
        name: actorInput.trim(),
        sortOrder: formActors.length,
      }]);
      setActorInput('');
    }
  };

  const handleDeleteActor = (index: number) => {
    const newActors = formActors.filter((_, i) => i !== index);
    setFormActors(newActors.map((a, i) => ({ ...a, sortOrder: i })));
  };

  const handleSave = async () => {
    if (!selectedMovie) return;

    try {
      setSaving(true);
      const dto: UpdateMetadataDto = {
        title: formTitle,
        summary: formSummary,
        tags: formTags,
        actors: formActors,
      };

      await api.updateMediaMetadata(selectedMovie.id, dto);

      setMovies((prev) =>
        prev.map((m) =>
          m.id === selectedMovie.id
            ? { ...m, title: formTitle, overview: formSummary }
            : m
        )
      );

      setSuccessMessage('元数据更新成功');
      setDialogOpen(false);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '-';
    }
  };

  const handleChangePage = (_: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    setRowsPerPage(newRowsPerPage);
    setPage(0);
  };

  return (
    <Container maxWidth="xl">
      {/* 顶部栏 */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h5">元数据管理</Typography>
        <TextField
          size="small"
          placeholder="搜索电影..."
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
          }}
          onChange={(e) => handleSearchChange(e.target.value)}
          sx={{ width: 300 }}
        />
      </Box>

      {/* 成功消息 */}
      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      {/* 错误消息 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 电影列表 */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TableContainer component={Paper}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>标题</TableCell>
                <TableCell>上映年份</TableCell>
                <TableCell>创建时间</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && movies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : movies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <Typography variant="body1" color="text.secondary">
                      暂无电影数据
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                movies.map((movie) => (
                  <TableRow key={movie.id} hover>
                    <TableCell>{movie.id}</TableCell>
                    <TableCell>{movie.title}</TableCell>
                    <TableCell>{movie.year || '-'}</TableCell>
                    <TableCell>{formatDate(movie.created_at)}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleOpenEditDialog(movie)}
                      >
                        <EditIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* 分页 */}
        {!loading && total > 0 && (
          <TablePagination
            rowsPerPageOptions={[5, 10, 20, 50, 100]}
            component="div"
            count={total}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            labelRowsPerPage="每页行数"
            labelDisplayedRows={({ from, to, count }) => `第 ${from}-${to} 条，共 ${count} 条`}
            sx={{ display: 'flex', justifyContent: 'flex-end' }}
          />
        )}
      </Box>

      {/* 编辑元数据对话框 */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>编辑元数据 - {selectedMovie?.title}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField fullWidth label="标题" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
            <TextField
              fullWidth
              label="简介"
              multiline
              rows={4}
              value={formSummary}
              onChange={(e) => setFormSummary(e.target.value)}
            />

            <Typography variant="subtitle2" gutterBottom>标签</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <TextField
                size="small"
                placeholder="添加标签..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                sx={{ flex: 1 }}
              />
              <Button variant="outlined" onClick={handleAddTag}>
                <AddIcon />
              </Button>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {formTags.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  onDelete={() => handleDeleteTag(tag)}
                  size="small"
                />
              ))}
            </Box>

            <Typography variant="subtitle2" gutterBottom>演员</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <TextField
                size="small"
                placeholder="添加演员..."
                value={actorInput}
                onChange={(e) => setActorInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddActor();
                  }
                }}
                sx={{ flex: 1 }}
              />
              <Button variant="outlined" onClick={handleAddActor}>
                <AddIcon />
              </Button>
            </Box>
            <List dense>
              {formActors.map((actor, index) => (
                <ListItem key={index}>
                  <ListItemAvatar>
                    <Avatar sx={{ width: 32, height: 32 }}>{actor.name[0]}</Avatar>
                  </ListItemAvatar>
                  <ListItemText primary={actor.name} secondary={`顺序: ${actor.sortOrder}`} />
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => handleDeleteActor(index)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>取消</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !formTitle}
          >
            {saving ? <CircularProgress size={20} /> : '保存'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
