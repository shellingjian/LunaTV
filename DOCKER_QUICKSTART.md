# 🚀 快速开始

## 方式一：GitHub Actions 自动构建（推荐）⭐

最简单的方式，提交代码即可自动构建：

```bash
git add .
git commit -m "feat: 更新功能"
git push origin main
```

**自动生成**：
- `ghcr.io/<你的用户名>/lunatv:latest`
- `ghcr.io/<你的用户名>/lunatv:v{版本号}` （版本变化时）

---

## 方式二：本地构建脚本

### Windows (PowerShell)
```powershell
.\build-docker.ps1
```

### Linux/macOS (Bash)
```bash
chmod +x build-docker.sh
./build-docker.sh
```

脚本会自动：
✅ 检测版本号  
✅ 配置 Docker Buildx  
✅ 构建 amd64 + arm64 镜像  
✅ （可选）推送到 GitHub Container Registry  

---

## 方式三：手动命令

```bash
# 1. 创建 buildx builder（仅首次）
docker buildx create --name multiarch --use
docker buildx inspect --bootstrap

# 2. 登录 GitHub Container Registry
echo <YOUR_TOKEN> | docker login ghcr.io -u <YOUR_USERNAME> --password-stdin

# 3. 构建并推送
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/<YOUR_USERNAME>/lunatv:latest \
  --tag ghcr.io/<YOUR_USERNAME>/lunatv:v1.0.0 \
  --push \
  .
```

---

## 📦 使用镜像

```bash
# 拉取镜像
docker pull ghcr.io/<YOUR_USERNAME>/lunatv:latest

# 运行容器
docker run -d \
  --name lunatv \
  -p 3000:3000 \
  -e USERNAME=admin \
  -e PASSWORD=your_password \
  -e NEXT_PUBLIC_STORAGE_TYPE=kvrocks \
  -e KVROCKS_URL=redis://kvrocks:6666 \
  ghcr.io/<YOUR_USERNAME>/lunatv:latest
```

---

## 📚 详细文档

查看 [`BUILD.md`](BUILD.md) 了解完整构建指南。

---

## 🔑 获取 GitHub Token

如果需要本地推送镜像：

1. 访问 https://github.com/settings/tokens
2. **Generate new token (classic)**
3. 勾选 `write:packages` 权限
4. 生成并保存 Token
5. 使用 Token 登录：
   ```bash
   echo <TOKEN> | docker login ghcr.io -u <USERNAME> --password-stdin
   ```

---

## ✨ 推荐工作流

**开发环境**：本地开发，使用 `pnpm run dev`  
**测试构建**：使用本地构建脚本验证镜像  
**生产部署**：推送代码，GitHub Actions 自动构建并推送  

这样可以确保生产环境的镜像始终通过 CI/CD 构建，可追溯且可靠！
