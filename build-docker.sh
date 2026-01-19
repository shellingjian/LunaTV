#!/bin/bash

# ============================================
# LunaTV Docker 多架构镜像构建脚本 (Bash)
# ============================================

set -e

echo -e "\033[36m🐳 LunaTV Docker 多架构镜像构建\033[0m"
echo -e "\033[36m================================\033[0m\n"

# 读取当前版本号
if [ -f "package.json" ]; then
    VERSION=$(node -p "require('./package.json').version")
    echo -e "\033[32m✅ 当前版本: v$VERSION\033[0m\n"
else
    echo -e "\033[31m❌ 无法找到 package.json 文件\033[0m"
    exit 1
fi

# 获取 Git 用户名（用于镜像名称）
GIT_USER=$(git config user.name 2>/dev/null | tr '[:upper:]' '[:lower:]' | tr -d ' ')
if [ -z "$GIT_USER" ]; then
    echo -e "\033[31m❌ 无法获取 Git 用户名\033[0m"
    read -p "请输入你的 GitHub 用户名: " GIT_USER
    GIT_USER=$(echo "$GIT_USER" | tr '[:upper:]' '[:lower:]')
fi

echo -e "\033[36m👤 Docker 镜像用户名: $GIT_USER\033[0m\n"

# 镜像配置
IMAGE_NAME="ghcr.io/$GIT_USER/lunatv"
PLATFORMS="linux/amd64,linux/arm64"

echo -e "\033[33m📦 镜像配置:\033[0m"
echo "   名称: $IMAGE_NAME"
echo "   平台: $PLATFORMS"
echo "   标签: latest, v$VERSION"
echo ""

# 询问是否推送到 registry
read -p "是否推送到 GitHub Container Registry? (y/n) [默认: n]: " PUSH
PUSH=${PUSH:-n}
echo ""

# 检查 Docker Buildx
echo -e "\033[36m🔍 检查 Docker Buildx...\033[0m"
if command -v docker buildx version &> /dev/null; then
    echo -e "\033[32m✅ Docker Buildx 已安装\033[0m\n"
else
    echo -e "\033[31m❌ Docker Buildx 未安装，请先安装 Docker Desktop\033[0m"
    exit 1
fi

# 检查或创建 builder
echo -e "\033[36m🏗️ 检查 builder...\033[0m"
if docker buildx ls | grep -q "multiarch"; then
    echo -e "\033[32m使用现有的 multiarch builder\033[0m"
    docker buildx use multiarch
else
    echo -e "\033[33m创建新的 multiarch builder...\033[0m"
    docker buildx create --name multiarch --use
    docker buildx inspect --bootstrap
fi
echo ""

# 如果需要推送，检查登录状态
if [ "$PUSH" = "y" ]; then
    echo -e "\033[36m🔐 检查 GitHub Registry 登录状态...\033[0m"
    
    if ! docker login ghcr.io --get-login &> /dev/null; then
        echo -e "\033[33m⚠️  未登录到 ghcr.io\033[0m"
        echo "请先登录："
        echo "   echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u $GIT_USER --password-stdin"
        echo ""
        
        read -p "是否现在登录? (y/n): " DO_LOGIN
        if [ "$DO_LOGIN" = "y" ]; then
            read -sp "请输入 GitHub Personal Access Token (需要 write:packages 权限): " TOKEN
            echo ""
            
            echo "$TOKEN" | docker login ghcr.io -u "$GIT_USER" --password-stdin
            
            if [ $? -eq 0 ]; then
                echo -e "\033[32m✅ 登录成功\033[0m\n"
            else
                echo -e "\033[31m❌ 登录失败，退出构建\033[0m"
                exit 1
            fi
        else
            echo -e "\033[33m跳过推送，仅构建本地镜像\033[0m\n"
            PUSH="n"
        fi
    else
        echo -e "\033[32m✅ 已登录到 ghcr.io\033[0m\n"
    fi
fi

# 构建命令
echo -e "\033[36m🚀 开始构建 Docker 镜像...\033[0m"
echo -e "\033[33m   这可能需要几分钟时间，请耐心等待...\033[0m\n"

BUILD_ARGS=(
    "buildx" "build"
    "--platform" "$PLATFORMS"
    "--tag" "${IMAGE_NAME}:latest"
    "--tag" "${IMAGE_NAME}:v$VERSION"
    "--progress" "plain"
)

if [ "$PUSH" = "y" ]; then
    BUILD_ARGS+=("--push")
    echo -e "\033[32m📤 构建并推送到 registry...\033[0m"
else
    echo -e "\033[33m💾 仅本地构建（不推送）...\033[0m"
    echo -e "\033[33m⚠️  注意：多架构镜像无法使用 --load 加载到本地 Docker，仅会推送到缓存\033[0m\n"
fi

BUILD_ARGS+=(".")

# 执行构建
docker "${BUILD_ARGS[@]}"

if [ $? -eq 0 ]; then
    echo -e "\n\033[32m✅ 构建成功！\033[0m"
    
    if [ "$PUSH" = "y" ]; then
        echo -e "\n\033[36m📦 镜像已推送到:\033[0m"
        echo "   ${IMAGE_NAME}:latest"
        echo "   ${IMAGE_NAME}:v$VERSION"
        echo ""
        
        echo -e "\033[36m🚀 使用镜像:\033[0m"
        echo "   docker pull ${IMAGE_NAME}:latest"
        echo "   docker run -d -p 3000:3000 -e USERNAME=admin -e PASSWORD=pass ${IMAGE_NAME}:latest"
        echo ""
    else
        echo -e "\n\033[33m💡 提示：要推送镜像，请在提示时选择 'y'\033[0m\n"
    fi
else
    echo -e "\n\033[31m❌ 构建失败，请检查错误日志\033[0m"
    exit 1
fi
