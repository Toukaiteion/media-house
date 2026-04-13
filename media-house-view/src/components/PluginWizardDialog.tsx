import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stepper,
  Step,
  StepLabel,
  Typography,
  TextField,
  Box,
  Paper,
  Alert,
  IconButton,
  Chip,
  Divider,
  Tabs,
  Tab,
  InputLabel,
  Select,
  MenuItem,
  FormControl,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ContentCopy as CopyIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Help as HelpIcon,
} from '@mui/icons-material';

interface PluginWizardDialogProps {
  open: boolean;
  onClose: () => void;
}

interface ConfigField {
  key: string;
  type: 'select' | 'boolean' | 'number' | 'string';
  label: string;
  default?: string | number | boolean;
  options?: string;
  min?: string;
  max?: string;
}

export function PluginWizardDialog({ open, onClose }: PluginWizardDialogProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Step 1: 基本信息
  const [basicInfo, setBasicInfo] = useState({
    pluginId: 'my-scraper',
    name: '我的搜刮器',
    version: '1.0.0',
    description: '从某个数据源获取媒体元数据',
    author: '',
    homepage: '',
    supportedMediaTypes: ['movie'],
    supportedLanguages: ['zh-CN'],
  });

  // Step 2: 配置字段
  const [configFields, setConfigFields] = useState<ConfigField[]>([]);

  // Step 3: 运行要求
  const [runtimeRequirements, setRuntimeRequirements] = useState({
    maxExecutionTimeSeconds: '300',
    minMemoryMb: '128',
  });

  // Step 4: 支持的标识符
  const [supportedIdentifiers, setSupportedIdentifiers] = useState<string[]>(['num']);

  const steps = [
    { label: '基本信息', description: '设置插件的基本信息' },
    { label: '配置字段', description: '定义插件的配置选项' },
    { label: '运行要求', description: '设置插件的运行环境要求' },
    { label: '生成代码', description: '生成插件文件和配置' },
  ];

  const mediaTypes = ['movie', 'tvshow', 'music'];
  const languages = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];
  const identifierTypes = ['num', 'filename', 'title', 'imdb', 'tmdb'];

  const handleNext = () => {
    setActiveStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleReset = () => {
    setActiveStep(0);
    setBasicInfo({
      pluginId: 'my-scraper',
      name: '我的搜刮器',
      version: '1.0.0',
      description: '从某个数据源获取媒体元数据',
      author: '',
      homepage: '',
      supportedMediaTypes: ['movie'],
      supportedLanguages: ['zh-CN'],
    });
    setConfigFields([]);
    setRuntimeRequirements({
      maxExecutionTimeSeconds: '300',
      minMemoryMb: '128',
    });
    setSupportedIdentifiers(['num']);
  };

  const handleAddConfigField = () => {
    setConfigFields([
      ...configFields,
      {
        key: `field_${configFields.length + 1}`,
        type: 'string',
        label: '新字段',
        default: '',
        options: '',
        min: '',
        max: '',
      },
    ]);
  };

  const handleUpdateConfigField = (index: number, field: ConfigField) => {
    const newFields = [...configFields];
    newFields[index] = field;
    setConfigFields(newFields);
  };

  const handleDeleteConfigField = (index: number) => {
    setConfigFields(configFields.filter((_, i) => i !== index));
  };

  const handleCopyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const generatePluginJson = () => {
    const configSchema: Record<string, any> = {};
    configFields.forEach((field) => {
      const schemaField: any = {
        type: field.type,
        label: field.label,
      };
      if (field.default !== '') {
        schemaField.default = field.default;
      }
      if (field.options) {
        schemaField.options = field.options.split(',').map((opt) => {
          const [value, label] = opt.trim().split(':');
          return { value: value.trim(), label: label?.trim() || value.trim() };
        });
      }
      if (field.min) {
        schemaField.min = parseInt(field.min);
      }
      if (field.max) {
        schemaField.max = parseInt(field.max);
      }
      configSchema[field.key] = schemaField;
    });

    const pluginJson = {
      id: basicInfo.pluginId,
      name: basicInfo.name,
      version: basicInfo.version,
      description: basicInfo.description,
      author: basicInfo.author || undefined,
      homepage: basicInfo.homepage || undefined,
      supported_media_types: basicInfo.supportedMediaTypes,
      supported_languages: basicInfo.supportedLanguages,
      config_schema: Object.keys(configSchema).length > 0 ? configSchema : undefined,
      runtime_requirements: {
        max_execution_time_seconds: parseInt(runtimeRequirements.maxExecutionTimeSeconds) || undefined,
        min_memory_mb: parseInt(runtimeRequirements.minMemoryMb) || undefined,
      },
      entry_point: 'bin/scraper',
      supported_identifiers: supportedIdentifiers,
    };

    return JSON.stringify(pluginJson, null, 2);
  };

  const generatePythonTemplate = () => {
    return `#!/usr/bin/env python3
import sys
import json

def main():
    # 配置输出编码
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

    # 1. 从stdin读取输入
    input_data = json.load(sys.stdin)

    action = input_data.get("action")
    source_dir = input_data.get("source_dir")
    output_dir = input_data.get("output_dir")
    config = input_data.get("config", {})
    media_info = input_data.get("media_info", {})

    # 2. 发送进度通知到stderr
    def send_progress(step, message, percent):
        progress = {
            "type": "progress",
            "step": step,
            "message": message,
            "percent": percent
        }
        print(json.dumps(progress), file=sys.stderr, flush=True)

    try:
        send_progress("initializing", "Starting scraper...", 0)

        # TODO: 在这里实现你的搜刮逻辑
        # 示例：从 source_dir 读取文件信息
        send_progress("searching", "Searching for metadata...", 10)

        # TODO: 根据配置和媒体信息搜索元数据
        send_progress("parsing", "Parsing metadata...", 50)

        # TODO: 下载图片等资源
        send_progress("downloading", "Downloading images...", 80)

        # TODO: 保存文件
        send_progress("saving", "Saving metadata...", 90)

        # 3. 向stdout输出结果
        result = {
            "status": "success",
            "message": "Scraping completed",
            "metadata": {
                "title": "${basicInfo.name}",
                "original_title": "",
                "year": 2024,
                "release_date": "",
                "summary": "剧情简介",
                "runtime": 120,
                "studio": "制作公司",
                "maker": "发行商",
                "num": "",
                "tags": [],
                "actors": [],
                "images": {
                    "poster": "poster.jpg",
                    "thumb": "thumb.jpg",
                    "fanart": "fanart.jpg"
                }
            },
            "created_files": {
                "nfo": "movie.nfo",
                "poster": "poster.jpg",
                "fanart": "fanart.jpg",
                "screenshots": []
            },
            "statistics": {
                "total_time_ms": 5000,
                "api_requests": 3
            }
        }

        send_progress("completed", "Completed!", 100)
        print(json.dumps(result), file=sys.stdout, flush=True)

        # 4. 返回0表示成功
        sys.exit(0)

    except Exception as e:
        error_msg = {
            "type": "error",
            "message": str(e)
        }
        print(json.dumps(error_msg), file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()`;
  };

  const generateDirectoryStructure = () => {
    return `${basicInfo.pluginId}/${basicInfo.version}/
├── plugin.json          # 插件定义文件（必需）
├── bin/                 # 可执行文件目录（必需）
│   ├── scraper          # Linux/macOS可执行文件
│   └── scraper.exe      # Windows可执行文件
└── README.md            # 说明文档（可选）

# 插件安装后会被放到系统插件目录：
# /path/to/plugins/${basicInfo.pluginId}/${basicInfo.version}/`;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">插件编写向导</Typography>
          <Tooltip title="根据设计文档创建新的搜刮插件">
            <IconButton size="small">
              <HelpIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((step, index) => (
            <Step key={index}>
              <StepLabel>{step.label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            {steps[activeStep].description}
          </Typography>
        </Box>

        {/* Step 1: 基本信息 */}
        {activeStep === 0 && (
          <Box>
            <Alert severity="info" sx={{ mb: 3 }}>
              设置插件的基本信息，这些信息将显示在插件管理界面中。
            </Alert>

            <TextField
              fullWidth
              label="插件ID (英文，小写，连字符)"
            value={basicInfo.pluginId}
            onChange={(e) => setBasicInfo({ ...basicInfo, pluginId: e.target.value })}
            helperText="例如: av-mogu, javbus, tmdb-scraper"
            sx={{ mb: 2 }}
              required
            />
            <TextField
              fullWidth
              label="插件名称 (显示名称)"
            value={basicInfo.name}
            onChange={(e) => setBasicInfo({ ...basicInfo, name: e.target.value })}
            sx={{ mb: 2 }}
              required
            />
            <TextField
              fullWidth
              label="版本号"
            value={basicInfo.version}
            onChange={(e) => setBasicInfo({ ...basicInfo, version: e.target.value })}
            helperText="遵循语义化版本号，例如: 1.0.0"
            sx={{ mb: 2 }}
              required
            />
            <TextField
              fullWidth
              label="插件描述"
            value={basicInfo.description}
            onChange={(e) => setBasicInfo({ ...basicInfo, description: e.target.value })}
              multiline
              rows={2}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="作者"
            value={basicInfo.author}
            onChange={(e) => setBasicInfo({ ...basicInfo, author: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="主页URL"
            value={basicInfo.homepage}
            onChange={(e) => setBasicInfo({ ...basicInfo, homepage: e.target.value })}
              helperText="插件项目或文档的网址"
              sx={{ mb: 2 }}
            />
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <FormControl sx={{ minWidth: 200 }}>
                <InputLabel>支持的媒体类型</InputLabel>
                <Select
                  multiple
                  value={basicInfo.supportedMediaTypes}
                  label="支持的媒体类型"
                  onChange={(e) => setBasicInfo({ ...basicInfo, supportedMediaTypes: e.target.value as string[] })}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((value) => (
                        <Chip key={value} label={value} size="small" />
                      ))}
                    </Box>
                  )}
                >
                  {mediaTypes.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl sx={{ minWidth: 200 }}>
                <InputLabel>支持的语言</InputLabel>
                <Select
                  multiple
                  value={basicInfo.supportedLanguages}
                  label="支持的语言"
                  onChange={(e) => setBasicInfo({ ...basicInfo, supportedLanguages: e.target.value as string[] })}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((value) => (
                        <Chip key={value} label={value} size="small" />
                      ))}
                    </Box>
                  )}
                >
                  {languages.map((lang) => (
                    <MenuItem key={lang} value={lang}>
                      {lang}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </Box>
        )}

        {/* Step 2: 配置字段 */}
        {activeStep === 1 && (
          <Box>
            <Alert severity="info" sx={{ mb: 3 }}>
              定义用户可配置的插件选项。这些配置将在插件执行时作为config参数传递。
            </Alert>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
              <Button startIcon={<AddIcon />} onClick={handleAddConfigField} variant="outlined">
                添加配置字段
              </Button>
            </Box>

            {configFields.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'background.default' }}>
                <Typography color="text.secondary">
                  暂无配置字段。点击上方按钮添加。
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  配置字段是可选的，如果不添加，插件将不需要用户配置。
                </Typography>
              </Paper>
            ) : (
              <Box>
                {configFields.map((field, index) => (
                  <Paper key={index} sx={{ p: 2, mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="subtitle1">字段 #{index + 1}</Typography>
                      <IconButton onClick={() => handleDeleteConfigField(index)} color="error" size="small">
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
                      <TextField
                        label="字段键名"
                        value={field.key}
                        onChange={(e) => handleUpdateConfigField(index, { ...field, key: e.target.value })}
                        helperText="用于访问配置值的键"
                        size="small"
                      />
                      <TextField
                        label="显示标签"
                        value={field.label}
                        onChange={(e) => handleUpdateConfigField(index, { ...field, label: e.target.value })}
                        size="small"
                      />
                      <FormControl size="small">
                        <InputLabel>字段类型</InputLabel>
                        <Select
                          value={field.type}
                          label="字段类型"
                          onChange={(e) => handleUpdateConfigField(index, { ...field, type: e.target.value as any })}
                        >
                          <MenuItem value="string">文本 (string) - 文本输入框</MenuItem>
                          <MenuItem value="number">数字 (number) - 数字输入框</MenuItem>
                          <MenuItem value="boolean">布尔 (boolean) - 开关</MenuItem>
                          <MenuItem value="select">选择 (select) - 下拉菜单</MenuItem>
                        </Select>
                      </FormControl>
                      <TextField
                        label="默认值"
                        value={field.default?.toString() || ''}
                        onChange={(e) => handleUpdateConfigField(index, { ...field, default: e.target.value })}
                        helperText="不填则无默认值"
                        size="small"
                      />
                      {field.type === 'select' && (
                        <TextField
                          label="选项 (值:标签,值:标签)"
                          value={field.options}
                          onChange={(e) => handleUpdateConfigField(index, { ...field, options: e.target.value })}
                          helperText="例如: zh:中文,en:英文"
                          fullWidth
                          sx={{ gridColumn: '1 / -1' }}
                          size="small"
                        />
                      )}
                      {field.type === 'number' && (
                        <>
                          <TextField
                            label="最小值"
                            value={field.min}
                            onChange={(e) => handleUpdateConfigField(index, { ...field, min: e.target.value })}
                            type="number"
                            size="small"
                          />
                          <TextField
                            label="最大值"
                            value={field.max}
                            onChange={(e) => handleUpdateConfigField(index, { ...field, max: e.target.value })}
                            type="number"
                            size="small"
                          />
                        </>
                      )}
                    </Box>
                  </Paper>
                ))}
              </Box>
            )}
          </Box>
        )}

        {/* Step 3: 运行要求 */}
        {activeStep === 2 && (
          <Box>
            <Alert severity="info" sx={{ mb: 3 }}>
              设置插件的运行环境要求，系统将根据这些限制来管理插件的执行。
            </Alert>

            <TextField
              fullWidth
              label="最大执行时间（秒）"
              value={runtimeRequirements.maxExecutionTimeSeconds}
              onChange={(e) => setRuntimeRequirements({ ...runtimeRequirements, maxExecutionTimeSeconds: e.target.value })}
              type="number"
              helperText="插件执行的超时时间，超时将被强制终止"
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="最小内存要求（MB）"
              value={runtimeRequirements.minMemoryMb}
              onChange={(e) => setRuntimeRequirements({ ...runtimeRequirements, minMemoryMb: e.target.value })}
              type="number"
              helperText="插件运行需要的最小内存"
              sx={{ mb: 2 }}
            />

            <Divider sx={{ my: 3 }} />

            <Typography variant="subtitle1" gutterBottom>
              支持的标识符类型
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              插件支持的媒体标识方式，用于匹配和搜索媒体。
            </Typography>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {identifierTypes.map((type, index) => (
                <Chip
                  key={index}
                  label={type}
                  onClick={() => {
                    if (supportedIdentifiers.includes(type)) {
                      setSupportedIdentifiers(supportedIdentifiers.filter((t) => t !== type));
                    } else {
                      setSupportedIdentifiers([...supportedIdentifiers, type]);
                    }
                  }}
                  color={supportedIdentifiers.includes(type) ? 'primary' : 'default'}
                  clickable
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Step 4: 生成代码 */}
        {activeStep === 3 && (
          <Box>
            <Alert severity="success" sx={{ mb: 3 }}>
              配置完成！以下是为您生成的插件代码和文件结构。
            </Alert>

            <Tabs value={0}>
              <Tab label="plugin.json" />
            </Tabs>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle1" gutterBottom>
              plugin.json
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              插件定义文件，放到插件根目录。
            </Typography>
            <Paper sx={{ p: 2, position: 'relative' }}>
              <IconButton
                sx={{ position: 'absolute', right: 8, top: 8 }}
                onClick={() => handleCopyToClipboard(generatePluginJson(), 'plugin.json')}
              >
                <CopyIcon />
              </IconButton>
              <Typography
                component="pre"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  maxHeight: 300,
                  overflow: 'auto',
                }}
              >
                {generatePluginJson()}
              </Typography>
              {copiedField === 'plugin.json' && (
                <Typography variant="caption" color="success.main" sx={{ mt: 1 }}>
                  已复制到剪贴板
                </Typography>
              )}
            </Paper>

            <Divider sx={{ my: 3 }} />

            <Typography variant="subtitle1" gutterBottom>
              目录结构
            </Typography>
            <Paper sx={{ p: 2, position: 'relative' }}>
              <IconButton
                sx={{ position: 'absolute', right: 8, top: 8 }}
                onClick={() => handleCopyToClipboard(generateDirectoryStructure(), 'directory')}
              >
                <CopyIcon />
              </IconButton>
              <Typography
                component="pre"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {generateDirectoryStructure()}
              </Typography>
              {copiedField === 'directory' && (
                <Typography variant="caption" color="success.main" sx={{ mt: 1 }}>
                  已复制到剪贴板
                </Typography>
              )}
            </Paper>

            <Divider sx={{ my: 3 }} />

            <Typography variant="subtitle1" gutterBottom>
              Python示例代码 (scraper)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              可执行文件的示例代码。编译后命名为 scraper (Linux/macOS) 或 scraper.exe (Windows)。
            </Typography>
            <Paper sx={{ p: 2, position: 'relative' }}>
              <IconButton
                sx={{ position: 'absolute', right: 8, top: 8 }}
                onClick={() => handleCopyToClipboard(generatePythonTemplate(), 'python')}
              >
                <CopyIcon />
              </IconButton>
              <Typography
                component="pre"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  maxHeight: 300,
                  overflow: 'auto',
                }}
              >
                {generatePythonTemplate()}
              </Typography>
              {copiedField === 'python' && (
                <Typography variant="caption" color="success.main" sx={{ mt: 1 }}>
                  已复制到剪贴板
                </Typography>
              )}
            </Paper>

            <Divider sx={{ my: 3 }} />

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1">开发参考文档</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>输入输出格式</Typography>
                  <Typography variant="body2" paragraph>
                    插件通过标准输入/输出进行通信：
                  </Typography>
                  <Typography variant="body2" paragraph>
                    - <strong>输入 (stdin)</strong>: JSON格式，包含action、source_dir、output_dir、config等字段
                  </Typography>
                  <Typography variant="body2" paragraph>
                    - <strong>输出 (stdout)</strong>: JSON格式，包含status、metadata、created_files、statistics等字段
                  </Typography>
                  <Typography variant="body2" paragraph>
                    - <strong>进度通知 (stderr)</strong>: JSON行格式，每行一个进度事件
                  </Typography>
                  <Typography variant="body2" paragraph>
                    - <strong>退出码</strong>: 0表示成功，非0表示失败
                  </Typography>

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="subtitle2" gutterBottom>打包和安装</Typography>
                  <Typography variant="body2" paragraph>
                    1. 创建插件目录结构
                  </Typography>
                  <Typography variant="body2" paragraph>
                    2. 将 plugin.json 放到根目录
                  </Typography>
                  <Typography variant="body2" paragraph>
                    3. 将编译好的可执行文件放到 bin/ 目录
                  </Typography>
                  <Typography variant="body2" paragraph>
                    4. 打包为 tar.gz (Linux/macOS) 或 zip (Windows)
                  </Typography>
                  <Typography variant="body2" paragraph>
                    5. 在插件管理界面中上传安装
                  </Typography>
                </Box>
              </AccordionDetails>
            </Accordion>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {activeStep > 0 && (
          <Button onClick={handleBack}>
            上一步
          </Button>
        )}
        {activeStep === steps.length - 1 ? (
          <>
            <Button onClick={handleReset}>
              重新开始
            </Button>
            <Button onClick={onClose} variant="contained">
              完成
            </Button>
          </>
        ) : (
          <Button onClick={handleNext} variant="contained">
            下一步
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
