# Meme.Share

一个面向表情包分享与收藏的响应式网站。访客可以浏览和下载，注册用户可以上传、收藏、维护标签并建立个人主页。

线上地址：[https://memesharing.online](https://memesharing.online)

## 功能

- **用户注册与登录**：账号、密码哈希和登录会话持久保存到 SQLite
- **分级权限**：登录用户可上传并管理自己的内容，管理员可管理全站内容
- **访客免登录下载**：任何人都能浏览详情并下载原图
- **瀑布流展示**：按图片原始比例排列，使用数字分页浏览
- **标签检索**：上传时可填写最多 8 个标签，支持按标签模糊搜索
- **详情与收藏**：独立详情页展示下载量、收藏量和登录用户的收藏状态
- **相关推荐**：优先按共同标签推荐，标签不足时用热度和新鲜度兜底
- **个人主页**：公开展示用户资料、上传内容及关注统计
- **社交关系**：登录用户可关注或取消关注其他用户，收藏列表默认仅本人可见
- **沉浸式首页**：吸顶导航、主搜索区、热门标签、原比例瀑布流与移动端双列布局
- **连续登录体验**：收藏或关注前登录，成功后自动返回原页面
- **分页加载**：首页每页加载 40 张图片，降低首屏传输和渲染压力
- **资料编辑**：用户可在自己的主页修改昵称和上传头像
- **内容管理**：上传者可以删除自己的图片，并随时增加或移除标签
- **安全加固**：文件签名校验、认证限流、同源写请求校验及基础安全响应头
- **统一深色视觉**：深灰渐变、毛玻璃卡片、电光紫点缀与 Lucide 图标
- **详情信息**：详情页集中展示作者、尺寸、大小、上传时间和下载次数
- **排序**：支持刷新时重新洗牌的默认随机排序、最新上传、下载最多和收藏最多
- **移动端适配**：手机浏览器自动优化布局
- **便捷上传**：支持拖拽、剪贴板粘贴、一次选择多张、即时预览、拍照与快速上传
- **多格式识别**：支持 JPEG、PNG、GIF、WebP、AVIF 和 WebM，并校验真实文件签名
- **PWA**：可安装到手机桌面，并通过 Android 系统分享菜单接收其他应用分享的图片
- **快捷分享**：详情页可调用系统分享面板，将原图分享到微信、QQ 等应用

## 技术栈

Node.js 22.5+、Express 5、React、Tailwind CSS、Vite、Lucide Icons 和 SQLite。用户、会话、图片元数据和标签均存储在 SQLite，密码使用 scrypt 加盐哈希，Cookie 为 HttpOnly。旧版 `data.json` 仅用于首次迁移与回退备份。

## 本地运行

```bash
npm install
cp .env.example .env        # 然后编辑 .env，设置管理员账号密码
npm run build:web           # 构建 React 前端
npm test                    # 运行核心流程验收
npm start
```

打开 http://localhost:3000。访客可以直接浏览；进入「上传」页可注册普通账号或登录管理员账号。

## 配置（.env）

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` | 监听端口 | `3000` |
| `ADMIN_USERNAME` | 初始管理员用户名（**必填**） | 无 |
| `ADMIN_PASSWORD` | 初始管理员密码（**必填**） | 无 |
| `SESSION_TTL` | 登录会话有效期（毫秒） | `604800000` (7天) |
| `UPLOAD_DIR` | 图片存储目录 | `uploads/` |
| `DATA_FILE` | 旧版图片元数据迁移源 | `data.json` |
| `DATABASE_FILE` | SQLite 数据库文件 | `memesharing.db` |
| `AVATAR_DIR` | 用户头像存储目录 | `avatars/` |
| `MAX_FILE_SIZE` | 单张图片大小上限（字节） | `52428800` (50MB) |

> 管理员账号首次启动时写入数据库。之后修改环境变量中的密码不会覆盖数据库密码。

## 部署到云服务器 (VPS)

推荐直接使用仓库根目录的 `Dockerfile` 与 `compose.yaml`，完整步骤见 [`deploy/README.md`](deploy/README.md)。下面保留不使用容器时的 Node.js 部署方式。

以 Ubuntu 云服务器 + Nginx 反向代理为例：

### 1. 安装 Node.js 22+（Ubuntu）

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. 上传代码并安装依赖

```bash
git clone https://github.com/neeco22/MemesSharing.git /var/www/memesharing
cd /var/www/memesharing
npm install --omit=dev
cp .env.example .env
```

编辑 `.env`，设置你自己的 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`，并把 `PORT` 改成 `3000`（内网端口）。

### 3. 用 pm2 保持服务运行

```bash
sudo npm install -g pm2
NODE_ENV=production pm2 start server.js --name image-share
pm2 save
pm2 startup          # 按提示执行输出的命令，开机自启
```

### 4. 配置 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;      # 改成你的域名或服务器 IP

    # 单张图片最大 50MB，与 .env 的 MAX_FILE_SIZE 对应
    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 5. （推荐）启用 HTTPS

用 certbot 申请免费证书：

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

完成后直接访问 `https://your-domain.com` 即可。

## 备份

需要备份以下内容：

- `uploads/` —— 图片文件
- `avatars/` —— 用户头像
- `data.json` —— 旧版图片元数据迁移源与回退备份
- `memesharing.db` —— 用户、会话、图片、标签和统计数据

为了保证 SQLite 备份一致，建议先执行 `pm2 stop image-share`，完成复制后再执行 `pm2 start image-share`。不要只复制正在写入的数据库主文件而忽略 WAL 状态。

## 上线检查

```bash
node --version              # 应为 22.5 或更高
npm test                    # 所有验收测试通过
NODE_ENV=production npm start
curl http://127.0.0.1:3000/api/health
```

生产环境必须通过 HTTPS 访问，否则设置为 `Secure` 的登录 Cookie 不会由浏览器发送。

## API

| 方法 | 路径 | 说明 | 认证 |
| --- | --- | --- | --- |
| GET | `/api/images?sort=&tag=&seed=&limit=&offset=` | 图片列表、标签模糊搜索与分页；排序支持 `default`、`latest`、`downloads`、`favorites` | 无 |
| GET | `/api/images/:id` | 图片详情及当前用户收藏状态 | 无 |
| GET | `/api/images/:id/related` | 标签相似内容推荐 | 无 |
| POST | `/api/images/:id/favorite` | 收藏图片 | 登录 |
| DELETE | `/api/images/:id/favorite` | 取消收藏 | 登录 |
| GET | `/api/users/:username` | 用户主页资料与关注统计 | 无 |
| GET | `/api/users/:username/images` | 用户公开上传列表 | 无 |
| GET | `/api/users/:username/favorites` | 用户收藏列表 | 本人/管理员 |
| POST | `/api/users/:username/follow` | 关注用户 | 登录 |
| DELETE | `/api/users/:username/follow` | 取消关注 | 登录 |
| GET | `/api/tags/popular` | 热门标签列表 | 无 |
| POST | `/api/register` | 注册（JSON: `username`, `password`, `displayName`） | 无 |
| POST | `/api/login` | 用户登录（JSON: `username`, `password`） | 无 |
| POST | `/api/logout` | 退出登录 | 无 |
| GET | `/api/auth` | 检查登录状态 | Cookie |
| GET | `/api/health` | 服务与数据库健康状态 | 无 |
| PATCH | `/api/me` | 修改当前用户昵称 | 登录 |
| POST | `/api/me/avatar` | 上传当前用户头像 | 登录 |
| GET | `/avatar/:userId` | 查看用户头像 | 无 |
| GET | `/api/me/images` | 管理当前用户上传的内容 | 登录 |
| POST | `/api/upload` | 上传图片（form-data: `image`, `tags`） | 登录 |
| PATCH | `/api/images/:id/tags` | 修改自己图片的标签（管理员不限） | 登录 |
| DELETE | `/api/images/:id` | 删除自己的图片（管理员不限） | 登录 |
| POST | `/share-target` | 接收 Android 系统分享给 PWA 的图片 | 无 |
| GET | `/img/:id` | 查看 / 下载原图（`?download=1` 计一次下载） | 无 |
| GET | `/api/batch-download?ids=` | 批量打包 zip 下载（`ids`: 逗号分隔） | 无 |
