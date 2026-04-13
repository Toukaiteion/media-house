import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  CardActions,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  CircularProgress,
  Alert,
  Chip,
  Switch,
  FormControlLabel,
  TablePagination,
  Avatar,
} from '@mui/material';
import {
  Person as PersonIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Lock as LockIcon,
  VpnKey as VpnKeyIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { api } from '../../services/api';
import type { User, CreateUserDto, UpdateUserDto, ChangePasswordDto } from '../../types';

const DEFAULT_ROWS_PER_PAGE = 10;

type DialogType = 'none' | 'createUser' | 'editUser' | 'changePassword' | 'deleteUser' | 'deleteAccount' | 'changeCurrentPassword';

export function AccountSettingsPage() {
  // 当前用户状态
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUserLoading, setCurrentUserLoading] = useState(true);

  // 用户列表状态
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0); // MUI TablePagination 使用 0-based 索引
  const [total, setTotal] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE);
  const [searchValue, setSearchValue] = useState('');

  // 对话框状态
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<DialogType>('none');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 表单状态
  const [formUsername, setFormUsername] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formCurrentPassword, setFormCurrentPassword] = useState('');
  const [formNewPassword, setFormNewPassword] = useState('');
  const [formConfirmPassword, setFormConfirmPassword] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [deletePassword, setDeletePassword] = useState('');

  // 搜索防抖
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载当前用户
  const loadCurrentUser = useCallback(async () => {
    try {
      setCurrentUserLoading(true);
      const user = await api.getCurrentUser();
      setCurrentUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载当前用户信息失败');
    } finally {
      setCurrentUserLoading(false);
    }
  }, []);

  // 加载用户列表
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getUsers(searchValue || undefined, page + 1, rowsPerPage);
      setUsers(data.items);
      setTotal(data.total_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, searchValue]);

  // 初始化加载
  useEffect(() => {
    loadCurrentUser();
  }, [loadCurrentUser]);

  // 加载数据
  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // 搜索时重置到第一页
  useEffect(() => {
    setPage(0);
  }, [searchValue]);

  // 处理搜索输入
  const handleSearchChange = useCallback((value: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setSearchValue(value);
    }, 500);
  }, []);

  // 格式化日期
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

  // 打开创建用户对话框
  const handleOpenCreateDialog = () => {
    setDialogType('createUser');
    setFormUsername('');
    setFormEmail('');
    setFormPassword('');
    setFormIsActive(true);
    setDialogOpen(true);
  };

  // 打开编辑用户对话框
  const handleOpenEditDialog = (user: User) => {
    setDialogType('editUser');
    setSelectedUser(user);
    setFormUsername(user.username);
    setFormEmail(user.email);
    setFormIsActive(user.is_active);
    setDialogOpen(true);
  };

  // 打开修改密码对话框（当前用户）
  const handleOpenChangeCurrentPasswordDialog = () => {
    setDialogType('changeCurrentPassword');
    setFormCurrentPassword('');
    setFormNewPassword('');
    setFormConfirmPassword('');
    setDialogOpen(true);
  };

  // 打开修改密码对话框（其他用户）
  const handleOpenChangePasswordDialog = (user: User) => {
    setDialogType('changePassword');
    setSelectedUser(user);
    setFormCurrentPassword('');
    setFormNewPassword('');
    setFormConfirmPassword('');
    setDialogOpen(true);
  };

  // 打开删除用户对话框
  const handleOpenDeleteDialog = (user: User) => {
    setDialogType('deleteUser');
    setSelectedUser(user);
    setDialogOpen(true);
  };

  // 打开删除当前账户对话框
  const handleOpenDeleteAccountDialog = () => {
    setDialogType('deleteAccount');
    setDeletePassword('');
    setDialogOpen(true);
  };

  // 关闭对话框
  const handleCloseDialog = () => {
    setDialogOpen(false);
    setDialogType('none');
    setSelectedUser(null);
    setFormUsername('');
    setFormEmail('');
    setFormPassword('');
    setFormCurrentPassword('');
    setFormNewPassword('');
    setFormConfirmPassword('');
    setFormIsActive(true);
    setDeletePassword('');
  };

  // 创建用户
  const handleCreateUser = async () => {
    if (!formUsername || !formPassword || !formEmail) {
      setError('请填写所有必填字段');
      return;
    }

    try {
      setSaving(true);
      const dto: CreateUserDto = {
        username: formUsername,
        password: formPassword,
        email: formEmail,
      };

      await api.createUser(dto);
      setSuccessMessage('用户创建成功');
      setDialogOpen(false);
      loadUsers();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建用户失败');
    } finally {
      setSaving(false);
    }
  };

  // 更新用户
  const handleUpdateUser = async () => {
    if (!selectedUser || !formEmail) {
      setError('请填写所有必填字段');
      return;
    }

    try {
      setSaving(true);
      const dto: UpdateUserDto = {
        email: formEmail,
        isActive: formIsActive,
      };

      await api.updateUser(selectedUser.id, dto);
      setSuccessMessage('用户更新成功');
      setDialogOpen(false);
      loadUsers();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新用户失败');
    } finally {
      setSaving(false);
    }
  };

  // 修改当前用户密码
  const handleChangeCurrentPassword = async () => {
    if (!formCurrentPassword || !formNewPassword || !formConfirmPassword) {
      setError('请填写所有字段');
      return;
    }

    if (formNewPassword !== formConfirmPassword) {
      setError('新密码与确认密码不一致');
      return;
    }

    try {
      setSaving(true);
      await api.updateCurrentUser({
        current_password: formCurrentPassword,
        new_password: formNewPassword,
      });
      setSuccessMessage('密码修改成功');
      setDialogOpen(false);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改密码失败');
    } finally {
      setSaving(false);
    }
  };

  // 修改其他用户密码
  const handleChangePassword = async () => {
    if (!selectedUser || !formNewPassword || !formConfirmPassword) {
      setError('请填写所有字段');
      return;
    }

    if (formNewPassword !== formConfirmPassword) {
      setError('新密码与确认密码不一致');
      return;
    }

    try {
      setSaving(true);
      const dto: ChangePasswordDto = {
        current_password: formCurrentPassword,
        new_password: formNewPassword,
      };

      await api.changeUserPassword(selectedUser.id, dto);
      setSuccessMessage('密码修改成功');
      setDialogOpen(false);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改密码失败');
    } finally {
      setSaving(false);
    }
  };

  // 删除用户
  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    try {
      setSaving(true);
      await api.deleteUser(selectedUser.id);
      setSuccessMessage('用户删除成功');
      setDialogOpen(false);
      loadUsers();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除用户失败');
    } finally {
      setSaving(false);
    }
  };

  // 删除当前账户
  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setError('请输入密码确认');
      return;
    }

    try {
      setSaving(true);
      await api.deleteCurrentAccount({ password: deletePassword });
      // 删除成功后应该跳转到登录页
      localStorage.removeItem('auth-token');
      window.location.href = '/login';
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除账户失败');
    } finally {
      setSaving(false);
    }
  };

  // 处理保存
  const handleSave = () => {
    switch (dialogType) {
      case 'createUser':
        handleCreateUser();
        break;
      case 'editUser':
        handleUpdateUser();
        break;
      case 'changePassword':
        handleChangePassword();
        break;
      case 'changeCurrentPassword':
        handleChangeCurrentPassword();
        break;
      case 'deleteUser':
        handleDeleteUser();
        break;
      case 'deleteAccount':
        handleDeleteAccount();
        break;
    }
  };

  // 处理页码变化
  const handleChangePage = (_event: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
    setPage(newPage);
  };

  // 处理每页行数变化
  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    setRowsPerPage(newRowsPerPage);
    setPage(0);
  };

  // 获取对话框标题
  const getDialogTitle = () => {
    switch (dialogType) {
      case 'createUser':
        return '创建用户';
      case 'editUser':
        return `编辑用户 - ${selectedUser?.username}`;
      case 'changePassword':
        return `修改密码 - ${selectedUser?.username}`;
      case 'changeCurrentPassword':
        return '修改密码';
      case 'deleteUser':
        return `确认删除用户 "${selectedUser?.username}"`;
      case 'deleteAccount':
        return '确认删除当前账户';
      default:
        return '';
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* 顶部标题 */}
      <Typography variant="h4" gutterBottom>
        账户设置
      </Typography>

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

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* 当前用户信息卡片 */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonIcon />
              当前用户信息
            </Typography>
            {currentUserLoading ? (
              <CircularProgress />
            ) : currentUser ? (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body1" gutterBottom>
                  <strong>用户名:</strong> {currentUser.username}
                </Typography>
                <Typography variant="body1" gutterBottom>
                  <strong>邮箱:</strong> {currentUser.email}
                </Typography>
                <Typography variant="body1" gutterBottom>
                  <strong>状态:</strong> {currentUser.is_active ? '正常' : '禁用'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  创建时间: {formatDate(currentUser.create_time)}
                </Typography>
              </Box>
            ) : null}
          </CardContent>
          <CardActions sx={{ justifyContent: 'flex-end', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<LockIcon />}
              onClick={handleOpenChangeCurrentPasswordDialog}
            >
              修改密码
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={handleOpenDeleteAccountDialog}
            >
              删除账户
            </Button>
          </CardActions>
        </Card>

        {/* 用户管理 */}
        <Card>
          <CardContent>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 2,
              }}
            >
              <Typography variant="h6">用户管理</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  size="small"
                  placeholder="搜索用户名..."
                  InputProps={{
                    startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                  }}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  sx={{ width: 200 }}
                />
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={handleOpenCreateDialog}
                >
                  添加用户
                </Button>
              </Box>
            </Box>

            {/* 用户列表表格 */}
            <TableContainer component={Paper}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell />
                    <TableCell>ID</TableCell>
                    <TableCell>用户名</TableCell>
                    <TableCell>邮箱</TableCell>
                    <TableCell>状态</TableCell>
                    <TableCell>创建时间</TableCell>
                    <TableCell>更新时间</TableCell>
                    <TableCell align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center">
                        <CircularProgress />
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center">
                        <Typography variant="body1" color="text.secondary">
                          暂无用户数据
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.id} hover>
                        <TableCell>
                          <Avatar sx={{ width: 32, height: 32 }}>{user.username[0].toUpperCase()}</Avatar>
                        </TableCell>
                        <TableCell>{user.id}</TableCell>
                        <TableCell>{user.username}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Chip
                            label={user.is_active ? '正常' : '禁用'}
                            color={user.is_active ? 'success' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{formatDate(user.create_time)}</TableCell>
                        <TableCell>{formatDate(user.update_time)}</TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleOpenEditDialog(user)}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleOpenChangePasswordDialog(user)}
                          >
                            <VpnKeyIcon />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleOpenDeleteDialog(user)}
                          >
                            <DeleteIcon />
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
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                <TablePagination
                  rowsPerPageOptions={[5, 10, 20, 50]}
                  component="div"
                  count={total}
                  rowsPerPage={rowsPerPage}
                  page={page}
                  onPageChange={handleChangePage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  labelRowsPerPage="每页行数"
                  labelDisplayedRows={({ from, to, count }) =>
                    `第 ${from}-${to} 条，共 ${count} 条`
                  }
                />
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* 通用对话框 */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{getDialogTitle()}</DialogTitle>
        <DialogContent>
          {/* 创建用户 */}
          {dialogType === 'createUser' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="用户名"
                fullWidth
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                autoFocus
              />
              <TextField
                label="邮箱"
                fullWidth
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
              <TextField
                label="密码"
                fullWidth
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
              />
            </Box>
          )}

          {/* 编辑用户 */}
          {dialogType === 'editUser' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap:2, mt: 1 }}>
              <TextField
                label="用户名"
                fullWidth
                value={formUsername}
                disabled
                helperText="用户名不可修改"
              />
              <TextField
                label="邮箱"
                fullWidth
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                autoFocus
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                  />
                }
                label="启用账户"
              />
            </Box>
          )}

          {/* 修改当前用户密码 */}
          {dialogType === 'changeCurrentPassword' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="当前密码"
                fullWidth
                type="password"
                value={formCurrentPassword}
                onChange={(e) => setFormCurrentPassword(e.target.value)}
                autoFocus
              />
              <TextField
                label="新密码"
                fullWidth
                type="password"
                value={formNewPassword}
                onChange={(e) => setFormNewPassword(e.target.value)}
              />
              <TextField
                label="确认新密码"
                fullWidth
                type="password"
                value={formConfirmPassword}
                onChange={(e) => setFormConfirmPassword(e.target.value)}
              />
            </Box>
          )}

          {/* 修改其他用户密码 */}
          {dialogType === 'changePassword' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="当前用户密码"
                fullWidth
                type="password"
                value={formCurrentPassword}
                onChange={(e) => setFormCurrentPassword(e.target.value)}
                helperText="需要输入当前用户的密码进行验证"
                autoFocus
              />
              <TextField
                label="新密码"
                fullWidth
                type="password"
                value={formNewPassword}
                onChange={(e) => setFormNewPassword(e.target.value)}
              />
              <TextField
                label="确认新密码"
                fullWidth
                type="password"
                value={formConfirmPassword}
                onChange={(e) => setFormConfirmPassword(e.target.value)}
              />
            </Box>
          )}

          {/* 删除用户确认 */}
          {dialogType === 'deleteUser' && (
            <Typography sx={{ mt: 1 }}>
              确定要删除用户 "{selectedUser?.username}" 吗？此操作不可撤销。
            </Typography>
          )}

          {/* 删除当前账户确认 */}
          {dialogType === 'deleteAccount' && (
            <Box sx={{ mt: 1 }}>
              <Typography gutterBottom>
                确定要删除当前账户吗？此操作不可撤销，所有数据将被永久删除。
              </Typography>
              <TextField
                label="请输入密码确认"
                fullWidth
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                autoFocus
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>取消</Button>
          {dialogType !== 'deleteUser' && dialogType !== 'deleteAccount' ? (
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saving || (dialogType === 'createUser' && (!formUsername || !formPassword || !formEmail))}
            >
              {saving ? <CircularProgress size={20} /> : '保存'}
            </Button>
          ) : (
            <Button
              variant="contained"
              color="error"
              onClick={handleSave}
              disabled={saving || (dialogType === 'deleteAccount' && !deletePassword)}
            >
              {saving ? <CircularProgress size={20} /> : '确认删除'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Container>
  );
}
