import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const archiver = require('archiver');
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { imageSizeFromFile } from 'image-size/fromFile';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const UPLOAD_DIR = path.resolve(__dirname, process.env.UPLOAD_DIR || 'uploads');
const DATA_FILE = path.resolve(__dirname, process.env.DATA_FILE || 'data.json');
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024; // 默认 50MB
const SESSION_TTL = Number(process.env.SESSION_TTL) || 7 * 24 * 60 * 60 * 1000; // 会话有效期，默认 7 天

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('[FATAL] 未设置 ADMIN_USERNAME / ADMIN_PASSWORD 环境变量，无法启动。');
  process.exit(1);
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---- 动图判定：按扩展名简单判断 ----
const ANIMATED_EXTS = new Set(['gif', 'webm']);

// 返回 true=动图，false=静态
function detectAnimated(ext) {
  return ANIMATED_EXTS.has(ext);
}

// ---- 数据层：图片元数据持久化到 JSON ----
let images = []; // { id, filename, ext, originalName, size, width, height, uploadedAt }

async function loadData() {
  try {
    const raw = await fsp.readFile(DATA_FILE, 'utf8');
    images = JSON.parse(raw);
    if (!Array.isArray(images)) images = [];
  } catch {
    images = [];
  }
}

// 启动时按当前规则重新标记已有图片的动/静分类
async function backfillAnimated() {
  let changed = false;
  for (const img of images) {
    const animated = detectAnimated(img.ext);
    if (img.animated !== animated) {
      img.animated = animated;
      changed = true;
    }
  }
  if (changed) {
    await saveData();
    console.log(`已按当前规则更新 ${images.length} 张图片的动/静分类`);
  }
}

async function saveData() {
  await fsp.writeFile(DATA_FILE, JSON.stringify(images, null, 2), 'utf8');
}

function findImage(id) {
  return images.find((img) => img.id === id);
}

// ---- 会话管理：内存存储登录态 ----
const sessions = new Map(); // token -> { expiresAt }

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL });
  return token;
}

function destroySession(token) {
  sessions.delete(token);
}

function requireAdmin(req, res, next) {
  const token = req.cookies?.sid;
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (session) sessions.delete(token);
    return res.status(401).json({ error: '未登录或登录已过期' });
  }
  next();
}

// ---- 上传配置 ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase());
  },
});

function fileFilter(req, file, cb) {
  const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.webm', '.svg', '.bmp', '.ico', '.avif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) return cb(null, true);
  cb(new Error('仅支持 JPG / PNG / GIF / WebP / WebM / SVG / BMP / ICO / AVIF 格式'));
}

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

const app = express();
app.use(express.json());
app.use(cookieParser());

// ---- API：登录 / 登出 / 会话状态 ----
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = createSession();
    res.cookie('sid', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_TTL,
    });
    return res.json({ ok: true });
  }
  res.status(401).json({ error: '用户名或密码错误' });
});

app.post('/api/logout', (req, res) => {
  destroySession(req.cookies?.sid);
  res.clearCookie('sid');
  res.json({ ok: true });
});

app.get('/api/auth', requireAdmin, (req, res) => {
  res.json({ ok: true });
});

// ---- 静态资源 ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- API：图片列表（支持排序与分类筛选）----
app.get('/api/images', (req, res) => {
  const { sort = 'newest', type = '' } = req.query;

  let result = [...images];

  if (type === 'animated') {
    result = result.filter((img) => img.animated === true);
  } else if (type === 'static') {
    result = result.filter((img) => img.animated !== true);
  }

  switch (sort) {
    case 'oldest':
      result.sort((a, b) => a.uploadedAt - b.uploadedAt);
      break;
    case 'downloads':
      result.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
      break;
    case 'newest':
    default:
      result.sort((a, b) => b.uploadedAt - a.uploadedAt);
      break;
  }

  res.json(result);
});

// ---- API：上传图片（仅管理员，需登录）----
app.post('/api/upload', requireAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择图片文件' });
  }

  const file = req.file;
  let width = null;
  let height = null;
  let animated = false;

  try {
    const dim = await imageSizeFromFile(file.path);
    width = dim.width ?? null;
    height = dim.height ?? null;
  } catch {
    // 某些图片（如 SVG 或损坏文件）可能读不出尺寸，忽略即可
  }

  animated = detectAnimated(file.originalname.split('.').pop().toLowerCase());

  const img = {
    id: crypto.randomUUID(),
    filename: file.filename,
    ext: path.extname(file.originalname).toLowerCase().slice(1),
    originalName: file.originalname,
    size: file.size,
    width,
    height,
    animated,
    uploadedAt: Date.now(),
  };

  images.push(img);
  await saveData();

  res.status(201).json(img);
});

// ---- API：删除图片（仅管理员，需登录）----
app.delete('/api/images/:id', requireAdmin, async (req, res) => {
  const img = findImage(req.params.id);
  if (!img) return res.status(404).json({ error: '图片不存在' });

  const filePath = path.join(UPLOAD_DIR, img.filename);
  await fsp.unlink(filePath).catch(() => {}); // 文件可能已被外部删除
  images = images.filter((i) => i.id !== img.id);
  await saveData();

  res.json({ ok: true });
});

// ---- 访问图片文件（访客免登录下载）----
app.get('/img/:id', async (req, res) => {
  const img = findImage(req.params.id);
  if (!img) return res.status(404).send('图片不存在');

  const filePath = path.join(UPLOAD_DIR, img.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('文件丢失');

  // 带 download 参数时计为一次下载，否则只是浏览
  if (req.query.download) {
    img.downloads = (img.downloads || 0) + 1;
    await saveData();
  }

  res.download(filePath, img.originalName, (err) => {
    if (err && !res.headersSent) res.status(404).send('文件读取失败');
  });
});

// ---- API：批量下载（打包为 zip，访客免登录）----
app.get('/api/batch-download', async (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter(Boolean);
  if (!ids.length) return res.status(400).json({ error: '未选择图片' });

  const chosen = ids.map(findImage).filter(Boolean);
  if (!chosen.length) return res.status(404).json({ error: '图片不存在' });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="memes-${Date.now()}.zip"`);

  const archive = new archiver.ZipArchive({ zlib: { level: 6 } });
  archive.on('error', (err) => { console.error(err); res.status(500).end(); });

  for (const img of chosen) {
    const filePath = path.join(UPLOAD_DIR, img.filename);
    if (fs.existsSync(filePath)) {
      archive.append(fs.createReadStream(filePath), { name: img.originalName });
    }
  }

  archive.pipe(res);
  archive.finalize();
});

// ---- 上传接口的错误处理（multer 错误统一转为友好提示）----
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `文件过大，最大支持 ${Math.floor(MAX_FILE_SIZE / 1024 / 1024)}MB` });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message && err.message.startsWith('仅支持')) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: '服务器错误' });
});

await loadData();
await backfillAnimated();
app.listen(PORT, () => {
  console.log(`图片分享站已启动: http://localhost:${PORT}`);
  console.log(`图片目录: ${UPLOAD_DIR}`);
});
