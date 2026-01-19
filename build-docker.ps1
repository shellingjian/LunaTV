# ============================================
# LunaTV Docker 多架构镜像构建脚本 (PowerShell)
# ============================================

Write-Host "🐳 LunaTV Docker 多架构镜像构建" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

# 读取当前版本号
try {
    $packageJson = Get-Content -Path "package.json" -Raw | ConvertFrom-Json
    $VERSION = $packageJson.version
    Write-Host "✅ 当前版本: v$VERSION`n" -ForegroundColor Green
} catch {
    Write-Host "❌ 无法读取 package.json 中的版本号" -ForegroundColor Red
    exit 1
}

# 获取 Git 用户名（用于镜像名称）
try {
    $GIT_USER = git config user.name
    if ([string]::IsNullOrWhiteSpace($GIT_USER)) {
        $GIT_USER = $env:USERNAME
    }
    $GIT_USER = $GIT_USER.ToLower() -replace '\s+',''
    Write-Host "👤 Docker 镜像用户名: $GIT_USER`n" -ForegroundColor Cyan
} catch {
    Write-Host "❌ 无法获取 Git 用户名，请手动设置" -ForegroundColor Red
    $GIT_USER = Read-Host "请输入你的 GitHub 用户名"
    $GIT_USER = $GIT_USER.ToLower()
}

# 镜像配置
$IMAGE_NAME = "ghcr.io/$GIT_USER/lunatv"
$PLATFORMS = "linux/amd64,linux/arm64"

Write-Host "📦 镜像配置:" -ForegroundColor Yellow
Write-Host "   名称: $IMAGE_NAME" -ForegroundColor White
Write-Host "   平台: $PLATFORMS" -ForegroundColor White
Write-Host "   标签: latest, v$VERSION`n" -ForegroundColor White

# 询问是否推送到 registry
$PUSH = Read-Host "是否推送到 GitHub Container Registry? (y/n) [默认: n]"
if ([string]::IsNullOrWhiteSpace($PUSH)) {
    $PUSH = "n"
}

Write-Host ""

# 检查 Docker Buildx
Write-Host "🔍 检查 Docker Buildx..." -ForegroundColor Cyan
try {
    docker buildx version | Out-Null
    Write-Host "✅ Docker Buildx 已安装`n" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker Buildx 未安装，请先安装 Docker Desktop" -ForegroundColor Red
    exit 1
}

# 检查或创建 builder
Write-Host "🏗️ 检查 builder..." -ForegroundColor Cyan
$builderExists = docker buildx ls | Select-String "multiarch"
if (-not $builderExists) {
    Write-Host "创建新的 multiarch builder..." -ForegroundColor Yellow
    docker buildx create --name multiarch --use
    docker buildx inspect --bootstrap
} else {
    Write-Host "使用现有的 multiarch builder" -ForegroundColor Green
    docker buildx use multiarch
}
Write-Host ""

# 如果需要推送，检查登录状态
if ($PUSH -eq "y") {
    Write-Host "🔐 检查 GitHub Registry 登录状态..." -ForegroundColor Cyan
    
    $loginTest = docker login ghcr.io --get-login 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️  未登录到 ghcr.io，请先登录：" -ForegroundColor Yellow
        Write-Host "   echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u $GIT_USER --password-stdin`n" -ForegroundColor White
        
        $doLogin = Read-Host "是否现在登录? (y/n)"
        if ($doLogin -eq "y") {
            $token = Read-Host "请输入 GitHub Personal Access Token (需要 write:packages 权限)" -AsSecureString
            $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($token)
            $plainToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
            
            echo $plainToken | docker login ghcr.io -u $GIT_USER --password-stdin
            
            if ($LASTEXITCODE -ne 0) {
                Write-Host "❌ 登录失败，退出构建" -ForegroundColor Red
                exit 1
            }
            Write-Host "✅ 登录成功`n" -ForegroundColor Green
        } else {
            Write-Host "跳过推送，仅构建本地镜像`n" -ForegroundColor Yellow
            $PUSH = "n"
        }
    } else {
        Write-Host "✅ 已登录到 ghcr.io`n" -ForegroundColor Green
    }
}

# 构建命令
Write-Host "🚀 开始构建 Docker 镜像..." -ForegroundColor Cyan
Write-Host "   这可能需要几分钟时间，请耐心等待...`n" -ForegroundColor Yellow

$buildArgs = @(
    "buildx", "build",
    "--platform", $PLATFORMS,
    "--tag", "${IMAGE_NAME}:latest",
    "--tag", "${IMAGE_NAME}:v$VERSION",
    "--progress", "plain"
)

if ($PUSH -eq "y") {
    $buildArgs += "--push"
    Write-Host "📤 构建并推送到 registry..." -ForegroundColor Green
} else {
    Write-Host "💾 仅本地构建（不推送）..." -ForegroundColor Yellow
    Write-Host "⚠️  注意：多架构镜像无法使用 --load 加载到本地 Docker，仅会推送到缓存`n" -ForegroundColor Yellow
}

$buildArgs += "."

# 执行构建
& docker $buildArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ 构建成功！" -ForegroundColor Green
    
    if ($PUSH -eq "y") {
        Write-Host "`n📦 镜像已推送到:" -ForegroundColor Cyan
        Write-Host "   ${IMAGE_NAME}:latest" -ForegroundColor White
        Write-Host "   ${IMAGE_NAME}:v$VERSION`n" -ForegroundColor White
        
        Write-Host "🚀 使用镜像:" -ForegroundColor Cyan
        Write-Host "   docker pull ${IMAGE_NAME}:latest" -ForegroundColor White
        Write-Host "   docker run -d -p 3000:3000 -e USERNAME=admin -e PASSWORD=pass ${IMAGE_NAME}:latest`n" -ForegroundColor White
    } else {
        Write-Host "`n💡 提示：要推送镜像，请使用参数 '-Push' 或在提示时选择 'y'`n" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n❌ 构建失败，请检查错误日志" -ForegroundColor Red
    exit 1
}
