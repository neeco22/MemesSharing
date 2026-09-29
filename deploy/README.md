# 正式部署

项目已提供 Docker 生产镜像和 Compose 配置。容器只监听服务器本机的 `127.0.0.1:3000`，公网流量应由 Nginx 或平台网关通过 HTTPS 转发。

## 1. 创建生产环境配置

复制 `.env.example` 为 `.docker.env`，至少修改：

```env
ADMIN_USERNAME=你的管理员用户名
ADMIN_PASSWORD=一个全新的高强度密码
SESSION_TTL=604800000
MAX_FILE_SIZE=52428800
```

不要提交 `.docker.env`。

## 2. 启动

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3000/api/health
```

数据库和图片保存在项目目录下的 `deploy-data/` 中，重建容器不会丢失，也便于直接备份。

## 3. 导入当前网站数据

首次上线后，把当前的 `memesharing.db`、`data.json` 和 `uploads/` 内容复制进 `deploy-data/`，再重新启动服务。复制 SQLite 数据库前应先完成 WAL checkpoint，避免遗漏尚未合并的数据。

目录应为：

```text
deploy-data/memesharing.db
deploy-data/data.json
deploy-data/uploads/<319 张图片及后续上传文件>
```

## 4. 域名与 HTTPS

将域名解析到服务器，参考 `deploy/nginx.conf.example` 配置反向代理，然后使用服务器或平台提供的 TLS 证书功能启用 HTTPS。生产环境的登录 Cookie 带有 `Secure` 属性，因此正式访问必须使用 HTTPS。

## 5. 备份

每天备份整个 `deploy-data/` 目录。SQLite 在线备份应使用 SQLite backup API，或者短暂停止容器后复制整个目录，不能只复制主数据库而忽略 WAL 文件。
