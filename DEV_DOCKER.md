# 🌿 Dev 分支 Docker 镜像构建指南

现在 GitHub Actions 已支持为 **dev 分支** 自动构建 Docker 镜像！

---

## ✨ 新增功能

✅ **dev 分支自动构建** - 推送到 dev 分支时自动触发  
✅ **自动 dev 标签** - dev 分支构建的镜像自动打上 `dev` 标签  
✅ **手动触发** - 可在任意分支手动触发构建，自定义标签  

---

## 🚀 使用方式

### 方式 1️⃣：自动构建（推送代码）

当你推送代码到 **dev 分支**时，会自动构建并推送镜像：

```bash
git checkout dev
git add .
git commit -m "feat: 开发中的新功能"
git push origin dev
```

**自动生成的镜像**：
```
ghcr.io/<你的用户名>/lunatv:dev
```

### 方式 2️⃣：手动触发（GitHub Actions 界面）

如果你想在 dev 分支手动触发构建：

1. 进入 GitHub 仓库的 **Actions** 标签页
2. 选择 **"Build & Push Docker image"** workflow
3. 点击右侧的 **"Run workflow"** 按钮
4. 选择分支：**dev**
5. （可选）输入自定义标签，如：
   - `dev-v1.0.0-beta`
   - `dev-test`
   - `dev-feature-xxx`
6. 点击绿色的 **"Run workflow"** 按钮

**生成的镜像**：
```
ghcr.io/<你的用户名>/lunatv:dev          # 默认 dev 标签
ghcr.io/<你的用户名>/lunatv:dev-v1.0.0-beta  # 如果输入了自定义标签
```

---

## 📦 不同分支的镜像标签规则

| 分支 | 自动标签 | 说明 |
|------|---------|------|
| **main** / **master** | `latest` | 生产环境稳定版 |
| **dev** | `dev` | 开发环境最新版 |
| 版本号变化时 | `v{版本号}` | 如 `v5.9.3` |
| 手动触发 | 自定义 | 如 `test`, `staging` |

---

## 🎯 推荐工作流

### 开发环境测试
```bash
# 1. 在 dev 分支开发
git checkout dev
git add .
git commit -m "feat: 新功能"
git push origin dev

# 2. 等待 GitHub Actions 自动构建（约 5-10 分钟）

# 3. 拉取 dev 镜像测试
docker pull ghcr.io/<你的用户名>/lunatv:dev

# 4. 运行测试
docker run -d -p 3000:3000 \
  -e USERNAME=admin \
  -e PASSWORD=test \
  ghcr.io/<你的用户名>/lunatv:dev
```

### 发布到生产环境
```bash
# 1. 将 dev 合并到 main
git checkout main
git merge dev
git push origin main

# 2. GitHub Actions 自动构建生产镜像
# 生成标签: latest, v{版本号}（如果版本变化）
```

---

## 🐳 使用 dev 镜像

### Docker 命令
```bash
docker pull ghcr.io/<你的用户名>/lunatv:dev

docker run -d \
  --name lunatv-dev \
  -p 3001:3000 \
  -e USERNAME=admin \
  -e PASSWORD=dev_password \
  -e NEXT_PUBLIC_STORAGE_TYPE=kvrocks \
  -e KVROCKS_URL=redis://kvrocks:6666 \
  ghcr.io/<你的用户名>/lunatv:dev
```

### Docker Compose
```yaml
services:
  lunatv-dev:
    image: ghcr.io/<你的用户名>/lunatv:dev
    container_name: lunatv-dev
    restart: unless-stopped
    ports:
      - "3001:3000"  # 避免与生产环境冲突
    environment:
      - USERNAME=admin
      - PASSWORD=dev_password
      - NEXT_PUBLIC_STORAGE_TYPE=kvrocks
      - KVROCKS_URL=redis://kvrocks:6666
      - SITE_BASE=https://dev.your-domain.com
```

---

## ⚡ 本地构建 dev 镜像

如果你想在本地构建 dev 镜像：

### Windows PowerShell
```powershell
# 切换到 dev 分支
git checkout dev

# 运行构建脚本
.\build-docker.ps1

# 脚本会自动检测当前分支并构建
```

### Linux/macOS
```bash
# 切换到 dev 分支
git checkout dev

# 运行构建脚本
chmod +x build-docker.sh
./build-docker.sh
```

---

## 🔍 查看构建状态

### 在 GitHub Actions 页面
1. 进入 **Actions** 标签
2. 查看最近的运行记录
3. 点击查看详细日志

### 查看已发布的镜像
访问你的 GitHub 仓库页面：
```
https://github.com/<你的用户名>/lunatv/pkgs/container/lunatv
```

---

## 💡 常见场景

### 场景 1：测试新功能
```bash
# 在 dev 分支开发
git checkout dev
# ... 编码 ...
git push origin dev  # 自动构建 dev 镜像

# 拉取测试
docker pull ghcr.io/<你的用户名>/lunatv:dev
docker run -d -p 3000:3000 ghcr.io/<你的用户名>/lunatv:dev
```

### 场景 2：创建测试版本
```bash
# 在 Actions 页面手动触发
# Branch: dev
# Tag: dev-v1.0.0-alpha

# 拉取特定版本
docker pull ghcr.io/<你的用户名>/lunatv:dev-v1.0.0-alpha
```

### 场景 3：快速回滚
```bash
# 如果 dev 镜像有问题，回退到上一个版本
docker pull ghcr.io/<你的用户名>/lunatv:latest  # 使用稳定版
```

---

## ⚠️ 注意事项

1. **镜像隔离**：dev 镜像和 latest 镜像是独立的，互不影响
2. **端口冲突**：同时运行多个版本时，使用不同端口（如 3000, 3001）
3. **数据隔离**：开发环境建议使用独立的数据库
4. **自动清理**：GitHub Actions 会自动清理旧的运行记录，保留最近 2 次

---

## 📚 相关文档

- [完整构建指南](BUILD.md)
- [快速开始](DOCKER_QUICKSTART.md)
- [GitHub Actions 配置](.github/workflows/docker-image.yml)

---

## 🎉 现在你可以

✅ 推送代码到 dev 分支，自动构建 dev 镜像  
✅ 在 GitHub Actions 手动触发任意分支的构建  
✅ 使用 `dev` 标签拉取最新的开发版镜像  
✅ 创建自定义标签用于特定测试版本  

享受更灵活的 Docker 镜像管理吧！🚀
