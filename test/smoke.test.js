import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');

function cookieFrom(response) {
  return response.headers.get('set-cookie')?.split(';', 1)[0] || '';
}

async function waitForServer(baseUrl, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`测试服务提前退出，代码 ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('等待测试服务启动超时');
}

async function jsonRequest(baseUrl, pathname, { method = 'GET', cookie = '', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

test('核心分享流程端到端验收', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memesharing-test-'));
  const port = 32000 + (process.pid % 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_FILE: path.join(tempDir, 'test.db'),
      DATA_FILE: path.join(tempDir, 'legacy.json'),
      UPLOAD_DIR: path.join(tempDir, 'uploads'),
      AVATAR_DIR: path.join(tempDir, 'avatars'),
      ADMIN_USERNAME: 'test_admin',
      ADMIN_PASSWORD: 'test_admin_password',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  try {
    await waitForServer(baseUrl, child);

    const health = await jsonRequest(baseUrl, '/api/health');
    assert.equal(health.response.status, 200);
    assert.equal(health.data.ok, true);

    const manifestResponse = await fetch(`${baseUrl}/manifest.webmanifest`);
    const manifest = await manifestResponse.json();
    assert.equal(manifest.share_target.action, '/share-target');
    assert.equal(manifest.share_target.params.files[0].accept.includes('*/*'), true);
    assert.equal(manifest.icons.some(icon => icon.sizes === '512x512'), true);
    const workerResponse = await fetch(`${baseUrl}/sw.js`);
    assert.equal(workerResponse.status, 200);
    assert.match(await workerResponse.text(), /share-target/);
    const shareFallback = await fetch(`${baseUrl}/share-target`, { method: 'POST', redirect: 'manual' });
    assert.equal(shareFallback.status, 303);

    const firstRegistration = await jsonRequest(baseUrl, '/api/register', {
      method: 'POST', body: { username: 'alice', password: 'password-123', displayName: 'Alice' },
    });
    assert.equal(firstRegistration.response.status, 201);
    const aliceCookie = cookieFrom(firstRegistration.response);

    const caseVariantRegistration = await jsonRequest(baseUrl, '/api/register', {
      method: 'POST', body: { username: 'Alice', password: 'password-CASE', displayName: '大写 Alice' },
    });
    assert.equal(caseVariantRegistration.response.status, 201);
    assert.notEqual(caseVariantRegistration.data.user.id, firstRegistration.data.user.id);

    const wrongCaseLogin = await jsonRequest(baseUrl, '/api/login', {
      method: 'POST', body: { username: 'ALICE', password: 'password-123' },
    });
    assert.equal(wrongCaseLogin.response.status, 401);
    assert.match(aliceCookie, /^sid=/);

    const secondRegistration = await jsonRequest(baseUrl, '/api/register', {
      method: 'POST', body: { username: 'bob_user', password: 'password-456', displayName: 'Bob' },
    });
    assert.equal(secondRegistration.response.status, 201);
    const bobCookie = cookieFrom(secondRegistration.response);

    const edit = await jsonRequest(baseUrl, '/api/me', {
      method: 'PATCH', cookie: aliceCookie, body: { displayName: 'Alice 新昵称' },
    });
    assert.equal(edit.response.status, 200);
    assert.equal(edit.data.user.displayName, 'Alice 新昵称');

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const avatarForm = new FormData();
    avatarForm.append('avatar', new Blob([png], { type: 'image/png' }), 'avatar.png');
    const avatarUpload = await fetch(`${baseUrl}/api/me/avatar`, { method: 'POST', headers: { Cookie: aliceCookie }, body: avatarForm });
    assert.equal(avatarUpload.status, 201);
    const avatarResult = await avatarUpload.json();
    assert.match(avatarResult.user.avatarUrl, /^\/avatar\//);
    const avatarResponse = await fetch(`${baseUrl}${avatarResult.user.avatarUrl}`);
    assert.equal(avatarResponse.status, 200);

    const form = new FormData();
    form.append('image', new Blob([png], { type: 'image/png' }), 'tiny.png');
    form.append('title', '测试表情');
    form.append('tags', '测试,开心');
    const upload = await fetch(`${baseUrl}/api/upload`, { method: 'POST', headers: { Cookie: aliceCookie }, body: form });
    assert.equal(upload.status, 201);
    const meme = await upload.json();
    assert.deepEqual(meme.tags.sort(), ['开心', '测试'].sort());

    const tagEdit = await jsonRequest(baseUrl, `/api/images/${meme.id}/tags`, {
      method: 'PATCH', cookie: aliceCookie, body: { tags: ['开心', '新标签'] },
    });
    assert.equal(tagEdit.response.status, 200);
    assert.deepEqual(tagEdit.data.tags.sort(), ['开心', '新标签'].sort());

    const forbiddenTagEdit = await jsonRequest(baseUrl, `/api/images/${meme.id}/tags`, {
      method: 'PATCH', cookie: bobCookie, body: { tags: ['不应保存'] },
    });
    assert.equal(forbiddenTagEdit.response.status, 403);

    const aliceUploads = await jsonRequest(baseUrl, '/api/me/images', { cookie: aliceCookie });
    const bobUploads = await jsonRequest(baseUrl, '/api/me/images', { cookie: bobCookie });
    assert.deepEqual(aliceUploads.data.map(item => item.id), [meme.id]);
    assert.deepEqual(bobUploads.data, []);

    const pagedProfile = await fetch(`${baseUrl}/api/users/alice/images?limit=30&offset=0`);
    assert.equal(pagedProfile.headers.get('x-total-count'), '1');
    assert.equal((await pagedProfile.json()).length, 1);

    const fakeForm = new FormData();
    fakeForm.append('image', new Blob(['not an image'], { type: 'image/jpeg' }), 'fake.jpg');
    const fakeUpload = await fetch(`${baseUrl}/api/upload`, { method: 'POST', headers: { Cookie: aliceCookie }, body: fakeForm });
    assert.equal(fakeUpload.status, 400);

    const paged = await fetch(`${baseUrl}/api/images?limit=1&offset=0`);
    assert.equal(paged.headers.get('x-total-count'), '1');
    assert.equal((await paged.json()).length, 1);

    const fuzzyTag = await fetch(`${baseUrl}/api/images?tag=${encodeURIComponent('新标')}`);
    assert.deepEqual((await fuzzyTag.json()).map(item => item.id), [meme.id]);

    const literalWildcard = await fetch(`${baseUrl}/api/images?tag=${encodeURIComponent('%')}`);
    assert.deepEqual(await literalWildcard.json(), []);

    const batchDownload = await fetch(`${baseUrl}/api/batch-download?ids=${encodeURIComponent(meme.id)}`);
    assert.equal(batchDownload.status, 200);
    assert.match(batchDownload.headers.get('content-type'), /application\/zip/);
    assert.ok((await batchDownload.arrayBuffer()).byteLength > 0);
    const afterBatchDownload = await jsonRequest(baseUrl, `/api/images/${meme.id}`);
    assert.equal(afterBatchDownload.data.downloads, 1);

    const tooManyIds = Array.from({ length: 61 }, () => meme.id).join(',');
    const oversizedBatch = await jsonRequest(baseUrl, `/api/batch-download?ids=${encodeURIComponent(tooManyIds)}`);
    assert.equal(oversizedBatch.response.status, 400);

    const favorite = await jsonRequest(baseUrl, `/api/images/${meme.id}/favorite`, { method: 'POST', cookie: bobCookie });
    assert.equal(favorite.data.favoriteCount, 1);
    const detail = await jsonRequest(baseUrl, `/api/images/${meme.id}`, { cookie: bobCookie });
    assert.equal(detail.data.favorited, true);
    assert.match(detail.data.uploaderAvatarUrl, /^\/avatar\//);

    const follow = await jsonRequest(baseUrl, '/api/users/alice/follow', { method: 'POST', cookie: bobCookie });
    assert.equal(follow.data.isFollowing, true);
    assert.equal(follow.data.followerCount, 1);

    const followers = await jsonRequest(baseUrl, '/api/users/alice/followers');
    assert.equal(followers.response.status, 200);
    assert.deepEqual(followers.data.map(user => user.username), ['bob_user']);
    assert.equal(followers.response.headers.get('x-total-count'), '1');

    const following = await jsonRequest(baseUrl, '/api/users/bob_user/following');
    assert.equal(following.response.status, 200);
    assert.deepEqual(following.data.map(user => user.username), ['alice']);

    const privateFavorites = await jsonRequest(baseUrl, '/api/users/bob_user/favorites', { cookie: aliceCookie });
    assert.equal(privateFavorites.response.status, 403);

    const crossOrigin = await jsonRequest(baseUrl, '/api/me', {
      method: 'PATCH', cookie: aliceCookie, body: { displayName: 'Blocked' }, headers: { Origin: 'https://evil.example' },
    });
    assert.equal(crossOrigin.response.status, 403);
  } catch (error) {
    error.message += `\n测试服务输出：\n${logs}`;
    throw error;
  }
});
