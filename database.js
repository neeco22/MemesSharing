import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_FILE = path.resolve(__dirname, process.env.DATABASE_FILE || 'memesharing.db');
const SESSION_TTL = Number(process.env.SESSION_TTL) || 7 * 24 * 60 * 60 * 1000;

const db = new DatabaseSync(DATABASE_FILE);
db.function('seeded_order', { deterministic: true }, (id, seed) => {
  let hash = (2166136261 ^ Number(seed)) >>> 0;
  for (const character of String(id)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
});
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_filename TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS memes (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    ext TEXT NOT NULL,
    original_name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    animated INTEGER NOT NULL DEFAULT 0,
    downloads INTEGER NOT NULL DEFAULT 0,
    uploader_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    uploaded_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS memes_uploader_id_idx ON memes(uploader_id);
  CREATE INDEX IF NOT EXISTS memes_uploaded_at_idx ON memes(uploaded_at DESC);
  CREATE INDEX IF NOT EXISTS memes_downloads_idx ON memes(downloads DESC);

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE
  );
  CREATE TABLE IF NOT EXISTS meme_tags (
    meme_id TEXT NOT NULL REFERENCES memes(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (meme_id, tag_id)
  );
  CREATE INDEX IF NOT EXISTS meme_tags_tag_id_idx ON meme_tags(tag_id);

  CREATE TABLE IF NOT EXISTS favorites (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    meme_id TEXT NOT NULL REFERENCES memes(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, meme_id)
  );
  CREATE INDEX IF NOT EXISTS favorites_meme_id_idx ON favorites(meme_id);

  CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (follower_id, following_id),
    CHECK (follower_id != following_id)
  );
  CREATE INDEX IF NOT EXISTS follows_following_id_idx ON follows(following_id);

  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// 旧数据库的用户名列使用 NOCASE，需要重建一次才能允许 neeco 与 NeeCo 并存。
function migrateUsernamesToCaseSensitive() {
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()?.sql || '';
  if (!/username\s+TEXT\s+NOT\s+NULL\s+COLLATE\s+NOCASE/i.test(schema)) return;
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE users_case_sensitive (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar_filename TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO users_case_sensitive
        (id, username, password_hash, display_name, avatar_filename, role, created_at, updated_at)
      SELECT id, username, password_hash, display_name, NULL, role, created_at, updated_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_case_sensitive RENAME TO users;
      COMMIT;
    `);
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch {}
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

migrateUsernamesToCaseSensitive();

if (!db.prepare("PRAGMA table_info(users)").all().some((column) => column.name === 'avatar_filename')) {
  db.exec('ALTER TABLE users ADD COLUMN avatar_filename TEXT;');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

function verifyPassword(password, storedHash) {
  const [algorithm, saltHex, hashHex] = String(storedHash).split(':');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    avatarUrl: user.avatar_filename ? `/avatar/${encodeURIComponent(user.id)}?v=${user.updated_at}` : null,
    role: user.role,
    createdAt: user.created_at,
  };
}

function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function createUser({ username, password, displayName, role = 'user' }) {
  const now = Date.now();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, username, hashPassword(password), displayName || username, role, now, now);
  return publicUser(findUserByUsername(username));
}

function authenticateUser(username, password) {
  const user = findUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  return publicUser(user);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(tokenHash(token), userId, now + SESSION_TTL, now);
  return token;
}

function getUserForSession(token) {
  if (!token) return null;
  const user = db.prepare(`
    SELECT users.* FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash(token), Date.now());
  return publicUser(user);
}

function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}

function cleanupExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
}

function ensureAdminUser(username, password) {
  if (!username || !password) return null;
  const existing = findUserByUsername(username);
  if (existing) {
    if (existing.role !== 'admin') {
      db.prepare("UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?").run(Date.now(), existing.id);
    }
    return publicUser(findUserByUsername(username));
  }
  return createUser({ username, password, displayName: username, role: 'admin' });
}

function normalizeTags(tags) {
  const values = Array.isArray(tags) ? tags : String(tags || '').split(/[,，\s]+/);
  return [...new Set(values.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))].slice(0, 8);
}

function rowToMeme(row) {
  if (!row) return null;
  return {
    id: row.id,
    filename: row.filename,
    ext: row.ext,
    originalName: row.original_name,
    title: row.title || '',
    size: row.size,
    width: row.width,
    height: row.height,
    animated: Boolean(row.animated),
    downloads: row.downloads || 0,
    uploadedAt: row.uploaded_at,
    uploaderId: row.uploader_id,
    uploaderUsername: row.uploader_username,
    uploaderDisplayName: row.uploader_display_name,
    uploaderAvatarUrl: row.uploader_avatar_filename
      ? `/avatar/${encodeURIComponent(row.uploader_id)}?v=${row.uploader_updated_at}`
      : null,
    tags: row.tag_names ? row.tag_names.split('\u001f') : [],
    favoriteCount: row.favorite_count || 0,
  };
}

const memeSelect = `
  SELECT memes.*, users.username AS uploader_username, users.display_name AS uploader_display_name,
    users.avatar_filename AS uploader_avatar_filename, users.updated_at AS uploader_updated_at,
    (SELECT GROUP_CONCAT(tags.name, char(31)) FROM meme_tags
      JOIN tags ON tags.id = meme_tags.tag_id WHERE meme_tags.meme_id = memes.id) AS tag_names,
    (SELECT COUNT(1) FROM favorites WHERE favorites.meme_id = memes.id) AS favorite_count
  FROM memes
  JOIN users ON users.id = memes.uploader_id
`;

function getMeme(id) {
  return rowToMeme(db.prepare(`${memeSelect} WHERE memes.id = ?`).get(id));
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

function memeFilters(type, tag) {
  const conditions = [];
  const params = [];
  if (type === 'animated') conditions.push('memes.animated = 1');
  if (type === 'static') conditions.push('memes.animated = 0');
  if (tag) {
    conditions.push(`EXISTS (
      SELECT 1 FROM meme_tags filter_mt JOIN tags filter_t ON filter_t.id = filter_mt.tag_id
      WHERE filter_mt.meme_id = memes.id
        AND filter_t.name LIKE ? ESCAPE '\\' COLLATE NOCASE
    )`);
    params.push(`%${escapeLike(tag)}%`);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

function listMemes({ sort = 'default', type = '', tag = '', seed = 1, limit = null, offset = 0 } = {}) {
  const { where, params } = memeFilters(type, tag);
  const order = sort === 'latest'
    ? 'memes.uploaded_at DESC, memes.id DESC'
    : sort === 'downloads'
      ? 'memes.downloads DESC, memes.uploaded_at DESC'
      : sort === 'favorites'
        ? '(SELECT COUNT(1) FROM favorites WHERE favorites.meme_id = memes.id) DESC, memes.uploaded_at DESC'
        : 'seeded_order(memes.id, ?) ASC';
  if (sort === 'default') params.push(seed);
  const paging = limit ? ' LIMIT ? OFFSET ?' : '';
  if (limit) params.push(limit, offset);
  return db.prepare(`${memeSelect} ${where} ORDER BY ${order}${paging}`).all(...params).map(rowToMeme);
}

function countMemes({ type = '', tag = '' } = {}) {
  const { where, params } = memeFilters(type, tag);
  return db.prepare(`SELECT COUNT(1) AS count FROM memes ${where}`).get(...params).count;
}

function isFavorite(userId, memeId) {
  if (!userId) return false;
  return Boolean(db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND meme_id = ?').get(userId, memeId));
}

function addFavorite(userId, memeId) {
  db.prepare('INSERT OR IGNORE INTO favorites (user_id, meme_id, created_at) VALUES (?, ?, ?)')
    .run(userId, memeId, Date.now());
  return { favorited: true, favoriteCount: getMeme(memeId)?.favoriteCount || 0 };
}

function removeFavorite(userId, memeId) {
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND meme_id = ?').run(userId, memeId);
  return { favorited: false, favoriteCount: getMeme(memeId)?.favoriteCount || 0 };
}

function getRelatedMemes(memeId, limit = 12) {
  const rows = db.prepare(`
    SELECT candidate.id, COUNT(DISTINCT source_tags.tag_id) AS shared_tags
    FROM memes candidate
    LEFT JOIN meme_tags candidate_tags ON candidate_tags.meme_id = candidate.id
    LEFT JOIN meme_tags source_tags
      ON source_tags.meme_id = ? AND source_tags.tag_id = candidate_tags.tag_id
    WHERE candidate.id != ?
    GROUP BY candidate.id
    ORDER BY shared_tags DESC, candidate.downloads DESC, candidate.uploaded_at DESC
    LIMIT ?
  `).all(memeId, memeId, limit);
  return rows.map((row) => ({ ...getMeme(row.id), sharedTagCount: row.shared_tags }));
}

function getUserProfile(username, viewerId = null) {
  const row = db.prepare(`
    SELECT users.id, users.username, users.display_name, users.avatar_filename, users.role, users.created_at, users.updated_at,
      (SELECT COUNT(1) FROM memes WHERE memes.uploader_id = users.id) AS upload_count,
      (SELECT COUNT(1) FROM follows WHERE follows.following_id = users.id) AS follower_count,
      (SELECT COUNT(1) FROM follows WHERE follows.follower_id = users.id) AS following_count,
      CASE WHEN ? IS NULL THEN 0 ELSE EXISTS(
        SELECT 1 FROM follows WHERE follower_id = ? AND following_id = users.id
      ) END AS is_following
    FROM users WHERE users.username = ?
  `).get(viewerId, viewerId, username);
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_filename ? `/avatar/${encodeURIComponent(row.id)}?v=${row.updated_at}` : null,
    role: row.role,
    createdAt: row.created_at,
    uploadCount: row.upload_count,
    followerCount: row.follower_count,
    followingCount: row.following_count,
    isFollowing: Boolean(row.is_following),
    isSelf: viewerId === row.id,
  };
}

function countUserMemes(userId) {
  return db.prepare('SELECT COUNT(1) AS count FROM memes WHERE uploader_id = ?').get(userId).count;
}

function listUserMemes(userId, { limit = null, offset = 0 } = {}) {
  const pagination = limit ? ' LIMIT ? OFFSET ?' : '';
  const params = limit ? [userId, limit, offset] : [userId];
  return db.prepare(`${memeSelect} WHERE memes.uploader_id = ? ORDER BY memes.uploaded_at DESC${pagination}`)
    .all(...params).map(rowToMeme);
}

function countFavoriteMemes(userId) {
  return db.prepare('SELECT COUNT(1) AS count FROM favorites WHERE user_id = ?').get(userId).count;
}

function listFavoriteMemes(userId, { limit = null, offset = 0 } = {}) {
  const pagination = limit ? ' LIMIT ? OFFSET ?' : '';
  const params = limit ? [userId, userId, limit, offset] : [userId, userId];
  return db.prepare(`${memeSelect}
    WHERE EXISTS (SELECT 1 FROM favorites f WHERE f.meme_id = memes.id AND f.user_id = ?)
    ORDER BY (SELECT created_at FROM favorites f WHERE f.meme_id = memes.id AND f.user_id = ?) DESC${pagination}`)
    .all(...params).map(rowToMeme);
}

function listPopularTags(limit = 12) {
  return db.prepare(`
    SELECT tags.name, COUNT(meme_tags.meme_id) AS count
    FROM tags JOIN meme_tags ON meme_tags.tag_id = tags.id
    GROUP BY tags.id ORDER BY count DESC, tags.name ASC LIMIT ?
  `).all(limit);
}

function followUser(followerId, followingId) {
  if (followerId === followingId) throw new Error('不能关注自己');
  db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)')
    .run(followerId, followingId, Date.now());
}

function unfollowUser(followerId, followingId) {
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(followerId, followingId);
}

function countUserConnections(userId, type) {
  const column = type === 'followers' ? 'following_id' : 'follower_id';
  return db.prepare(`SELECT COUNT(1) AS count FROM follows WHERE ${column} = ?`).get(userId).count;
}

function listUserConnections(userId, type, { limit = 60, offset = 0 } = {}) {
  const joinColumn = type === 'followers' ? 'follows.follower_id' : 'follows.following_id';
  const filterColumn = type === 'followers' ? 'follows.following_id' : 'follows.follower_id';
  return db.prepare(`
    SELECT users.* FROM follows
    JOIN users ON users.id = ${joinColumn}
    WHERE ${filterColumn} = ?
    ORDER BY follows.created_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset).map(publicUser);
}

function updateUserProfile(userId, displayName) {
  db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?')
    .run(displayName, Date.now(), userId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return publicUser(user);
}

function updateUserAvatar(userId, avatarFilename) {
  const previous = db.prepare('SELECT avatar_filename FROM users WHERE id = ?').get(userId)?.avatar_filename || null;
  db.prepare('UPDATE users SET avatar_filename = ?, updated_at = ? WHERE id = ?')
    .run(avatarFilename, Date.now(), userId);
  return { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId)), previousFilename: previous };
}

function getUserAvatar(userId) {
  return db.prepare('SELECT avatar_filename FROM users WHERE id = ?').get(userId)?.avatar_filename || null;
}

function databaseHealth() {
  return db.prepare('SELECT 1 AS ok').get().ok === 1;
}

function closeDatabase() {
  db.close();
}

function setMemeTags(memeId, rawTags) {
  const tags = normalizeTags(rawTags);
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const findTag = db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE');
  const linkTag = db.prepare('INSERT OR IGNORE INTO meme_tags (meme_id, tag_id) VALUES (?, ?)');
  for (const tag of tags) {
    insertTag.run(tag);
    linkTag.run(memeId, findTag.get(tag).id);
  }
}

function updateMemeTags(memeId, rawTags) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM meme_tags WHERE meme_id = ?').run(memeId);
    setMemeTags(memeId, rawTags);
    db.prepare('DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM meme_tags WHERE meme_tags.tag_id = tags.id)').run();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getMeme(memeId);
}

function createMeme(meme) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO memes
        (id, filename, ext, original_name, title, size, width, height, animated, downloads, uploader_id, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      meme.id, meme.filename, meme.ext, meme.originalName, meme.title || '', meme.size,
      meme.width, meme.height, meme.animated ? 1 : 0, meme.downloads || 0,
      meme.uploaderId, meme.uploadedAt,
    );
    setMemeTags(meme.id, meme.tags);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getMeme(meme.id);
}

function deleteMeme(id) {
  return db.prepare('DELETE FROM memes WHERE id = ?').run(id).changes > 0;
}

function incrementDownloads(id) {
  db.prepare('UPDATE memes SET downloads = downloads + 1 WHERE id = ?').run(id);
  return getMeme(id);
}

function migrateLegacyMemes(legacyImages, adminUser) {
  if (!adminUser || !Array.isArray(legacyImages)) return 0;
  const completed = db.prepare("SELECT value FROM app_meta WHERE key = 'legacy_json_migrated'").get();
  if (completed) return 0;
  let migrated = 0;
  for (const image of legacyImages) {
    const exists = db.prepare('SELECT 1 FROM memes WHERE id = ?').get(image.id);
    if (exists) continue;
    createMeme({
      ...image,
      title: image.title || path.parse(image.originalName || '').name,
      uploaderId: image.uploaderId || adminUser.id,
      tags: image.tags || [],
    });
    migrated += 1;
  }
  db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('legacy_json_migrated', ?)")
    .run(String(Date.now()));
  return migrated;
}

export {
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
};
