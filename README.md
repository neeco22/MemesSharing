# 图片分享站

简约图片分享网站：只有你能上传图片，访客无需登录即可浏览和下载。

## 功能

- **仅管理员可操作**：登录管理员账号后才能上传和删除图片
- **访客免登录下载**：任何人都能浏览、放大、下载原图
- **批量下载**：勾选多张图片打包成 zip 下载
- **深色模式**：右上角一键切换，跟随系统偏好，偏好本地保存
- **信息展示**：每张图显示尺寸、大小、上传时间、下载次数
- **排序**：按最新 / 最早 / 下载次数排序
- **移动端适配**：手机浏览器自动优化布局

## 技术栈

Node.js + Express 5 + Multer 2，前端原生 HTML/CSS/JS，图片元数据存 JSON 文件，登录态用内存会话 + HttpOnly Cookie。

## 本地运行

```bash
npm install
cp .env.example .env        # 然后编辑 .env，设置管理员账号密码
npm start
```

打开 http://localhost:3000，进入「上传」页用管理员账号登录。

## 配置（.env）

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` | 监听端口 | `3000` |
| `ADMIN_USERNAME` | 管理员用户名（**必填**） | 无 |
| `ADMIN_PASSWORD` | 管理员密码（**必填**） | 无 |
| `SESSION_TTL` | 登录会话有效期（毫秒） | `604800000` (7天) |
| `UPLOAD_DIR` | 图片存储目录 | `uploads/` |
| `DATA_FILE` | 元数据文件 | `data.json` |
| `MAX_FILE_SIZE` | 单张图片大小上限（字节） | `52428800` (50MB) |

> 会话以内存存储，服务重启后需重新登录。多实例部署会互相独立，如需多实例建议改用共享存储。

## 部署到云服务器 (VPS)

以 Ubuntu 云服务器 + Nginx 反向代理为例：

### 1. 安装 Node.js 20+（Ubuntu）

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. 上传代码并安装依赖

```bash
git clone <你的仓库地址> /var/www/image-share
cd /var/www/image-share
npm install --omit=dev
cp .env.example .env
```

编辑 `.env`，设置你自己的 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`，并把 `PORT` 改成 `3000`（内网端口）。

### 3. 用 pm2 保持服务运行

```bash
sudo npm install -g pm2
pm2 start server.js --name image-share
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

只需备份两个目录/文件：

- `uploads/` —— 图片文件
- `data.json` —— 图片元数据

## API

| 方法 | 路径 | 说明 | 认证 |
| --- | --- | --- | --- |
| GET | `/api/images?sort=` | 图片列表（`sort`: `newest`/`oldest`/`downloads`） | 无 |
| POST | `/api/login` | 管理员登录（JSON: `username`, `password`） | 无 |
| POST | `/api/logout` | 退出登录 | 无 |
| GET | `/api/auth` | 检查登录状态 | Cookie |
| POST | `/api/upload` | 上传图片（form-data: `image`） | 登录 |
| DELETE | `/api/images/:id` | 删除图片 | 登录 |
| GET | `/img/:id` | 查看 / 下载原图（`?download=1` 计一次下载） | 无 |
| GET | `/api/batch-download?ids=` | 批量打包 zip 下载（`ids`: 逗号分隔） | 无 |
