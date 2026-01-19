# 🐳 Docker 镜像构建指南

本项目支持多架构 Docker 镜像构建，可生成 `amd64` 和 `arm64` 两种架构的镜像。

---

## 📦 GitHub Actions 自动构建（推荐）

项目已配置 GitHub Actions 自动构建，支持以下触发方式：

### 1️⃣ 自动触发（推送代码）

当你推送代码到 `main` 或 `master` 分支时，会自动构建并推送 Docker 镜像：

```bash
git add .
git commit -m "feat: 新功能"
git push origin main
```

**自动生成的标签**：
- `latest`：始终指向最新构建
- `v{version}`：当 `package.json` 中的版本号变化时自动生成版本标签

### 2️⃣ 手动触发（自定义标签）

1. 进入 GitHub 仓库页面
2. 点击 **Actions** 标签
3. 选择 **Build & Push Docker image** workflow
4. 点击 **Run workflow**
5. 输入自定义标签（如 `v1.0.0-beta`）
6. 点击 **Run workflow** 开始构建

### 🎯 构建流程说明

GitHub Actions 使用 **并行构建 + 合并** 策略：

1. **并行构建阶段**：
   - 在 `ubuntu-latest` 上构建 `linux/amd64` 镜像
   - 在 `ubuntu-24.04-arm` 上构建 `linux/arm64` 镜像
2. **合并阶段**：
   - 将两个架构的镜像合并为一个 multi-arch manifest
   - 推送到 GitHub Container Registry（`ghcr.io`）

### 📍 镜像地址

构建完成后，镜像会推送到：

```
ghcr.io/<你的用户名>/lunatv:latest
ghcr.io/<你的用户名>/lunatv:v5.9.3  # 版本号变化时
```

---

## 🖥️ 本地构建（手动）

如果你需要在本地构建镜像，可以使用以下两种方法：

### 方法一：使用构建脚本（推荐）

运行项目提供的构建脚本：

```bash
# Windows PowerShell
.\build-docker.ps1

# Linux/macOS
chmod +x build-docker.sh
./build-docker.sh
```

脚本会自动：
- 设置 Docker Buildx
- 构建多架构镜像
- 推送到 GitHub Container Registry

### 方法二：手动命令

#### 前置准备

```bash
# 1. 创建 buildx builder（仅首次需要）
docker buildx create --name multiarch --use
docker buildx inspect --bootstrap

# 2. 登录 GitHub Container Registry
echo <你的_GITHUB_TOKEN> | docker login ghcr.io -u <你的用户名> --password-stdin
```

#### 构建并推送

```bash
# 读取当前版本号
$VERSION = (Get-Content package.json | ConvertFrom-Json).version  # PowerShell
VERSION=$(node -p "require('./package.json').version")  # Bash

# 构建多架构镜像并推送
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/<你的用户名>/lunatv:latest \
  --tag ghcr.io/<你的用户名>/lunatv:$VERSION \
  --push \
  .
```

#### 仅构建（不推送）

如果只想本地测试构建：

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag <你的用户名>/lunatv:test \
  --load \
  .
```

> ⚠️ **注意**：`--load` 只能用于单架构构建，多架构需要使用 `--push` 推送到 registry。

---

## 🔑 GitHub Token 配置

### 自动构建（GitHub Actions）

GitHub Actions 自动使用 `GITHUB_TOKEN`，无需额外配置。

### 本地推送镜像

如果需要在本地推送镜像到 `ghcr.io`，需要创建 Personal Access Token：

1. 访问 [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. 点击 **Generate new token (classic)**
3. 勾选权限：
   - `write:packages`（上传容器镜像）
   - `read:packages`（下载容器镜像）
   - `delete:packages`（删除容器镜像，可选）
4. 生成并保存 Token
5. 登录：
   ```bash
   echo <YOUR_TOKEN> | docker login ghcr.io -u <YOUR_USERNAME> --password-stdin
   ```

---

## 📂 镜像内容说明

最终镜像包含：

- **运行时环境**：Node.js 20 Alpine
- **应用文件**：
  - `.next/standalone`：Next.js 独立运行文件
  - `public/`：静态资源
  - `.next/static`：构建产物
  - `scripts/`：辅助脚本
  - `start.js`：启动脚本
- **用户权限**：非 root 用户 `nextjs:nodejs`（安全）
- **端口**：3000

---

## 🚀 使用镜像

### Docker 运行

```bash
docker run -d \
  --name lunatv \
  -p 3000:3000 \
  -e USERNAME=admin \
  -e PASSWORD=your_password \
  -e NEXT_PUBLIC_STORAGE_TYPE=kvrocks \
  -e KVROCKS_URL=redis://your-kvrocks:6666 \
  ghcr.io/<你的用户名>/lunatv:latest
```

### Docker Compose

```yaml
services:
  lunatv:
    image: ghcr.io/<你的用户名>/lunatv:latest
    container_name: lunatv
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - USERNAME=admin
      - PASSWORD=your_secure_password
      - NEXT_PUBLIC_STORAGE_TYPE=kvrocks
      - KVROCKS_URL=redis://kvrocks:6666
```

---

## 🔍 验证镜像架构

拉取镜像后，验证支持的架构：

```bash
docker manifest inspect ghcr.io/<你的用户名>/lunatv:latest | grep -A 5 "platform"
```

应该看到：
```json
"platform": {
  "architecture": "amd64",
  "os": "linux"
}
"platform": {
  "architecture": "arm64",
  "os": "linux"
}
```

---

## 🛠️ 故障排查

### 问题 1：buildx 不存在

```bash
# 安装 buildx（Docker Desktop 已内置）
docker buildx install
```

### 问题 2：平台不支持

```bash
# 检查可用平台
docker buildx ls

# 安装 QEMU（用于跨平台构建）
docker run --privileged --rm tonistiigi/binfmt --install all
```

### 问题 3：推送权限被拒绝

```bash
# 检查登录状态
docker login ghcr.io -u <你的用户名>

# 检查 Token 权限是否包含 write:packages
```

### 问题 4：GitHub Actions 构建失败

- 检查 `package.json` 中版本号格式是否正确
- 确保 Dockerfile 没有语法错误
- 查看 Actions 日志中的详细错误信息

---

## 📋 版本管理建议

1. **更新版本号**：修改 `package.json` 中的 `version` 字段
2. **推送代码**：Git 推送会自动触发构建
3. **版本标签**：版本号变化时自动生成 `v{version}` 标签
4. **稳定版本**：生产环境使用版本标签，避免使用 `latest`

```bash
# 示例：发布新版本
npm version patch  # 自动更新 package.json
git push origin main
# GitHub Actions 会自动构建 ghcr.io/你的用户名/lunatv:v5.9.4
```

---

## 🎯 最佳实践

1. ✅ **使用 GitHub Actions 自动构建**（推荐）
2. ✅ **本地测试用单架构构建**（快速）
3. ✅ **生产环境使用版本标签**（稳定）
4. ✅ **定期清理旧镜像**（节省存储空间）
5. ✅ **配置 `.dockerignore`**（减小构建上下文）

---

## 📞 需要帮助？

- **GitHub Issues**：提交问题到项目 Issues
- **Docker 文档**：https://docs.docker.com/buildx/working-with-buildx/
- **GitHub Actions 文档**：https://docs.github.com/en/actions
