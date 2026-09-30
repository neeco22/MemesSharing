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
import {
  SESSION_TTL,
  addFavorite,
  authenticateUser,
  cleanupExpiredSessions,
  closeDatabase,
  countMemes,
  countUserMemes,
  countFavoriteMemes,
  countUserConnections,
  databaseHealth,
  createMeme,
  createSession,
  createUser,
  deleteMeme,
  destroySession,
  ensureAdminUser,
  findUserByUsername,
  followUser,
  getMeme,
  getRelatedMemes,
  getUserProfile,
  getUserForSession,
  getUserAvatar,
  incrementDownloads,
  isFavorite,
  listMemes,
  listFavoriteMemes,
  listUserConnections,
  listUserMemes,
  listPopularTags,
  migrateLegacyMemes,
  removeFavorite,
  unfollowUser,
  updateUserProfile,
  updateUserAvatar,
  updateMemeTags,
} from './database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const UPLOAD_DIR = path.resolve(__dirname, process.env.UPLOAD_DIR || 'uploads');
const AVATAR_DIR = path.resolve(__dirname, process.env.AVATAR_DIR || 'avatars');
const DATA_FILE = path.resolve(__dirname, process.env.DATA_FILE || 'data.json');
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024; // 默认 50MB

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('[FATAL] 未设置 ADMIN_USERNAME / ADMIN_PASSWORD 环境变量，无法启动。');
  process.exit(1);
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(AVATAR_DIR, { recursive: true });

// ---- 动图判定：按扩展名简单判断 ----
const ANIMATED_EXTS = new Set(['gif', 'webm']);

// 返回 true=动图，false=静态
function detectAnimated(ext) {
  return ANIMATED_EXTS.has(ext);
}

// ---- 旧版 JSON 数据只用于首次迁移，之后以 SQLite 为准 ----
async function loadLegacyData() {
  try {
    const raw = await fsp.readFile(DATA_FILE, 'utf8');
    const images = JSON.parse(raw);
    return Array.isArray(images) ? images : [];
  } catch {
    return [];
  }
}

// ---- 会话与权限 ----
function currentUser(req) {
  return getUserForSession(req.cookies?.sid);
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: '请先登录' });
  req.user = user;
  next();
}

function setSessionCookie(res, token) {
  res.cookie('sid', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL,
    path: '/',
  });
}

function validateRegistration(username, password, displayName) {
  if (!/^[a-zA-Z0-9_\u4e00-\u9fff]{3,24}$/.test(username)) {
    return '用户名须为 3–24 位中文、字母、数字或下划线';
  }
  if (password.length < 8 || password.length > 128) return '密码须为 8–128 位';
  if (displayName && displayName.length > 30) return '昵称最多 30 位';
  return null;
}

const authAttempts = new Map();
function authRateLimit(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  const current = authAttempts.get(key);
  if (!current || current.resetAt <= now) {
    authAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return next();
  }
  if (current.count >= 20) {
    res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
    return res.status(429).json({ error: '尝试次数过多，请稍后再试' });
  }
  current.count += 1;
  next();
}

async function hasValidFileSignature(filePath, ext) {
  const handle = await fsp.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(32);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const data = buffer.subarray(0, bytesRead);
    const ascii = data.toString('ascii');
    if (ext === 'jpg' || ext === 'jpeg') return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    if (ext === 'png') return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (ext === 'gif') return ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a');
    if (ext === 'webp') return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP';
    if (ext === 'webm') return data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (ext === 'bmp') return ascii.startsWith('BM');
    if (ext === 'ico') return data[0] === 0 && data[1] === 0 && data[2] === 1 && data[3] === 0;
    if (ext === 'avif') return ascii.slice(4, 8) === 'ftyp' && /avif|avis/.test(ascii.slice(8, 24));
    return false;
  } finally {
    await handle.close();
  }
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
  const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.webm', '.bmp', '.ico', '.avif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) return cb(null, true);
  cb(new Error('仅支持 JPG / PNG / GIF / WebP / WebM / BMP / ICO / AVIF 格式'));
}

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATAR_DIR),
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(new Error('头像仅支持 JPG / PNG / GIF / WebP / AVIF 格式'));
  },
});

const app = express();
app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'");
  next();
});
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) || !req.headers.origin) return next();
  try {
    if (new URL(req.headers.origin).host === req.headers.host) return next();
  } catch {}
  return res.status(403).json({ error: '请求来源无效' });
});

// ---- API：注册 / 登录 / 登出 / 会话状态 ----
app.post('/api/register', authRateLimit, (req, res, next) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const displayName = String(req.body?.displayName || '').trim();
  const validationError = validateRegistration(username, password, displayName);
  if (validationError) return res.status(400).json({ error: validationError });
  if (findUserByUsername(username)) return res.status(409).json({ error: '该用户名已被使用' });

  try {
    const user = createUser({ username, password, displayName });
    const token = createSession(user.id);
    setSessionCookie(res, token);
    res.status(201).json({ ok: true, user });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(409).json({ error: '该用户名已被使用' });
    }
    next(error);
  }
});

app.post('/api/login', authRateLimit, (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const user = authenticateUser(username, password);
  if (user) {
    const token = createSession(user.id);
    setSessionCookie(res, token);
    return res.json({ ok: true, user });
  }
  res.status(401).json({ error: '用户名或密码错误' });
});

app.post('/api/logout', (req, res) => {
  destroySession(req.cookies?.sid);
  res.clearCookie('sid', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: databaseHealth(), uptime: Math.floor(process.uptime()) });
});

app.patch('/api/me', requireAuth, (req, res) => {
  const displayName = String(req.body?.displayName || '').trim();
  if (!displayName || displayName.length > 30) return res.status(400).json({ error: '昵称须为 1–30 位' });
  res.json({ ok: true, user: updateUserProfile(req.user.id, displayName) });
});

app.post('/api/me/avatar', requireAuth, avatarUpload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择头像图片' });
  const ext = path.extname(req.file.originalname).toLowerCase().slice(1);
  if (!(await hasValidFileSignature(req.file.path, ext))) {
    await fsp.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: '头像文件内容与图片格式不匹配' });
  }
  const result = updateUserAvatar(req.user.id, req.file.filename);
  if (result.previousFilename) {
    await fsp.unlink(path.join(AVATAR_DIR, result.previousFilename)).catch(() => {});
  }
  res.status(201).json({ ok: true, user: result.user });
});

app.get('/avatar/:userId', (req, res) => {
  const filename = getUserAvatar(req.params.userId);
  if (!filename || path.basename(filename) !== filename) return res.status(404).end();
  res.sendFile(path.join(AVATAR_DIR, filename), (error) => {
    if (error && !res.headersSent) res.status(404).end();
  });
});

// ---- API：个人主页与关注关系 ----
app.get('/api/users/:username', (req, res) => {
  const viewer = currentUser(req);
  const profile = getUserProfile(req.params.username, viewer?.id);
  if (!profile) return res.status(404).json({ error: '用户不存在' });
  res.json(profile);
});

app.get('/api/users/:username/images', (req, res) => {
  const user = findUserByUsername(req.params.username);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const limit = Math.min(Math.max(Number(req.query.limit) || 0, 0), 60);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  if (limit) res.setHeader('X-Total-Count', countUserMemes(user.id));
  res.json(listUserMemes(user.id, { limit: limit || null, offset }));
});

for (const type of ['followers', 'following']) {
  app.get(`/api/users/:username/${type}`, (req, res) => {
    const user = findUserByUsername(req.params.username);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 60);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    res.setHeader('X-Total-Count', countUserConnections(user.id, type));
    res.json(listUserConnections(user.id, type, { limit, offset }));
  });
}

app.get('/api/me/images', requireAuth, (req, res) => {
  res.json(listUserMemes(req.user.id));
});

app.get('/api/users/:username/favorites', requireAuth, (req, res) => {
  const user = findUserByUsername(req.params.username);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (req.user.id !== user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '收藏列表仅本人可见' });
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 0, 0), 60);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  if (limit) res.setHeader('X-Total-Count', countFavoriteMemes(user.id));
  res.json(listFavoriteMemes(user.id, { limit: limit || null, offset }));
});

app.post('/api/users/:username/follow', requireAuth, (req, res) => {
  const target = findUserByUsername(req.params.username);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (target.id === req.user.id) return res.status(400).json({ error: '不能关注自己' });
  followUser(req.user.id, target.id);
  res.json(getUserProfile(target.username, req.user.id));
});

app.delete('/api/users/:username/follow', requireAuth, (req, res) => {
  const target = findUserByUsername(req.params.username);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  unfollowUser(req.user.id, target.id);
  res.json(getUserProfile(target.username, req.user.id));
});

// 未被已安装 PWA 的 Service Worker 接住时，回到上传页显示说明。
app.post('/share-target', (req, res) => {
  res.redirect(303, '/upload.html?shareError=1');
});

// ---- 静态资源 ----
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  setHeaders: (res, filePath) => {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (path.extname(filePath).toLowerCase() === '.html' || path.basename(filePath) === 'sw.js' || path.basename(filePath) === 'manifest.webmanifest') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// ---- API：图片列表（支持排序与分类筛选）----
app.get('/api/images', (req, res) => {
  const sort = ['default', 'latest', 'downloads', 'favorites'].includes(req.query.sort) ? req.query.sort : 'default';
  const type = ['animated', 'static'].includes(req.query.type) ? req.query.type : '';
  const tag = String(req.query.tag || '').trim().slice(0, 30);
  const seed = Math.min(Math.max(Math.trunc(Number(req.query.seed)) || 1, 1), 2147483646);
  const limit = Math.min(Math.max(Number(req.query.limit) || 0, 0), 60);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  if (limit) res.setHeader('X-Total-Count', countMemes({ type, tag }));
  res.json(listMemes({ sort, type, tag, seed, limit: limit || null, offset }));
});

app.get('/api/tags/popular', (req, res) => {
  res.json(listPopularTags(12));
});

app.get('/api/images/:id', (req, res) => {
  const meme = getMeme(req.params.id);
  if (!meme) return res.status(404).json({ error: '图片不存在' });
  const user = currentUser(req);
  res.json({ ...meme, favorited: isFavorite(user?.id, meme.id) });
});

app.get('/api/images/:id/related', (req, res) => {
  if (!getMeme(req.params.id)) return res.status(404).json({ error: '图片不存在' });
  res.json(getRelatedMemes(req.params.id, 12));
});

app.post('/api/images/:id/favorite', requireAuth, (req, res) => {
  if (!getMeme(req.params.id)) return res.status(404).json({ error: '图片不存在' });
  res.json(addFavorite(req.user.id, req.params.id));
});

app.delete('/api/images/:id/favorite', requireAuth, (req, res) => {
  if (!getMeme(req.params.id)) return res.status(404).json({ error: '图片不存在' });
  res.json(removeFavorite(req.user.id, req.params.id));
});

// ---- API：上传图片（仅管理员，需登录）----
app.post('/api/upload', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择图片文件' });
  }

  const file = req.file;
  let width = null;
  let height = null;
  let animated = false;

  const ext = path.extname(file.originalname).toLowerCase().slice(1);
  if (!(await hasValidFileSignature(file.path, ext))) {
    await fsp.unlink(file.path).catch(() => {});
    return res.status(400).json({ error: '文件内容与图片格式不匹配' });
  }

  try {
    const dim = await imageSizeFromFile(file.path);
    width = dim.width ?? null;
    height = dim.height ?? null;
  } catch {
    // 某些图片（如 SVG 或损坏文件）可能读不出尺寸，忽略即可
  }

  animated = detectAnimated(file.originalname.split('.').pop().toLowerCase());

  const tags = String(req.body.tags || '').split(/[,，\s]+/).filter(Boolean).slice(0, 8);

  const img = {
    id: crypto.randomUUID(),
    filename: file.filename,
    ext,
    originalName: file.originalname,
    size: file.size,
    width,
    height,
    animated,
    uploadedAt: Date.now(),
    uploaderId: req.user.id,
    title: '',
    tags,
  };

  try {
    res.status(201).json(createMeme(img));
  } catch (error) {
    await fsp.unlink(file.path).catch(() => {});
    throw error;
  }
});

// ---- API：修改图片标签（上传者或管理员）----
app.patch('/api/images/:id/tags', requireAuth, (req, res) => {
  const img = getMeme(req.params.id);
  if (!img) return res.status(404).json({ error: '图片不存在' });
  const canEdit = req.user.role === 'admin' || img.uploaderId === req.user.id;
  if (!canEdit) return res.status(403).json({ error: '你只能修改自己上传内容的标签' });

  const tags = req.body?.tags;
  if (tags !== undefined && !Array.isArray(tags) && typeof tags !== 'string') {
    return res.status(400).json({ error: '标签格式不正确' });
  }
  if ((Array.isArray(tags) && tags.length > 20) || (typeof tags === 'string' && tags.length > 320)) {
    return res.status(400).json({ error: '标签内容过长' });
  }
  res.json(updateMemeTags(img.id, tags || []));
});

// ---- API：删除图片（仅管理员，需登录）----
app.delete('/api/images/:id', requireAuth, async (req, res) => {
  const img = getMeme(req.params.id);
  if (!img) return res.status(404).json({ error: '图片不存在' });
  const canDelete = req.user.role === 'admin' || img.uploaderId === req.user.id;
  if (!canDelete) return res.status(403).json({ error: '你只能删除自己上传的内容' });

  const filePath = path.join(UPLOAD_DIR, img.filename);
  await fsp.unlink(filePath).catch(() => {}); // 文件可能已被外部删除
  deleteMeme(img.id);

  res.json({ ok: true });
});

// ---- 访问图片文件（访客免登录下载）----
app.get('/img/:id', async (req, res) => {
  let img = getMeme(req.params.id);
  if (!img) return res.status(404).send('图片不存在');

  const filePath = path.join(UPLOAD_DIR, img.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('文件丢失');

  // 带 download 参数时计为一次下载，否则只是浏览
  if (req.query.download) {
    img = incrementDownloads(img.id);
  }

  res.download(filePath, img.originalName, (err) => {
    if (err && !res.headersSent) res.status(404).send('文件读取失败');
  });
});

// ---- API：批量下载（打包为 zip，访客免登录）----
app.get('/api/batch-download', async (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter(Boolean);
  if (!ids.length) return res.status(400).json({ error: '未选择图片' });
  if (ids.length > 60) return res.status(400).json({ error: '一次最多下载 60 张图片' });

  const chosen = ids.map(getMeme).filter(Boolean);
  if (!chosen.length) return res.status(404).json({ error: '图片不存在' });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="memes-${Date.now()}.zip"`);

  const archive = new archiver.ZipArchive({ zlib: { level: 6 } });
  archive.on('error', (err) => { console.error(err); res.status(500).end(); });

  for (const img of chosen) {
    const filePath = path.join(UPLOAD_DIR, img.filename);
    if (fs.existsSync(filePath)) {
      incrementDownloads(img.id);
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

const adminUser = ensureAdminUser(ADMIN_USERNAME, ADMIN_PASSWORD);
const legacyImages = await loadLegacyData();
const migratedCount = migrateLegacyMemes(legacyImages, adminUser);
if (migratedCount) console.log(`已迁移 ${migratedCount} 张历史图片到 SQLite`);
cleanupExpiredSessions();
const sessionCleanupTimer = setInterval(cleanupExpiredSessions, 60 * 60 * 1000);
sessionCleanupTimer.unref();

const server = app.listen(PORT, () => {
  console.log(`图片分享站已启动: http://localhost:${PORT}`);
  console.log(`图片目录: ${UPLOAD_DIR}`);
});

function shutdown(signal) {
  console.log(`收到 ${signal}，正在安全停止服务…`);
  clearInterval(sessionCleanupTimer);
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
