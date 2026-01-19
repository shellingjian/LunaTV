# 🔧 GitHub Actions 构建错误修复说明

## ❌ 原问题

在之前的 GitHub Actions 运行中出现了 **exit code 128** 错误：

```
The process '/usr/bin/git' failed with exit code 128
```

这个错误出现在 3 个地方：

- build (linux/amd64)
- build (linux/arm64)
- merge

## 🔍 问题原因

旧代码在检查版本号时使用了 `git checkout` 命令：

```bash
# ❌ 有问题的旧代码
git checkout HEAD~1 -- package.json  # 修改了工作区
PREVIOUS_VERSION=$(node -p "require('./package.json').version")
git checkout HEAD -- package.json    # 尝试恢复，但可能失败
```

**问题**：

1. `git checkout` 会修改工作区文件
2. 后续的 `git checkout HEAD` 可能因为各种原因失败
3. 导致 git 返回 exit code 128

## ✅ 解决方案

使用 `git show` 命令**直接读取上一次提交的内容**，不修改工作区：

```bash
# ✅ 修复后的新代码
PREVIOUS_VERSION=$(git show HEAD~1:package.json 2>/dev/null | \
  node -p "try { JSON.parse(require('fs').readFileSync(0, 'utf-8')).version } catch(e) { '0.0.0' }")
```

**优势**：

- ✅ 不修改工作区
- ✅ 更安全，不会留下未提交的更改
- ✅ 避免 git checkout 的各种潜在问题

## 📝 修改内容

### 修改了两个地方：

1. **build 阶段**（第 46-66 行）
2. **merge 阶段**（第 132-152 行）

都使用了相同的修复方式。

## 🚀 现在可以正常使用

修复后，你可以：

1. **提交更新**：

   ```bash
   git add .github/workflows/docker-image.yml
   git commit -m "fix: 修复 GitHub Actions git checkout exit code 128 错误"
   git push origin main
   ```

2. **重新触发构建**：
   - 推送代码到任意监听的分支（main、master、dev）
   - 或在 Actions 页面手动触发

3. **验证修复**：
   - 检查 Actions 运行日志
   - 应该看到绿色的 ✓ 而不是黄色的 ⚠️

## 📊 预期结果

构建成功后，你应该看到：

```
✓ 2 jobs completed
✓ merge (21s)
✓ cleanup-refresh (3s)
```

并且镜像会被成功推送到：

```
ghcr.io/<你的用户名>/lunatv:latest  # main/master 分支
ghcr.io/<你的用户名>/lunatv:dev     # dev 分支
ghcr.io/<你的用户名>/lunatv:v{版本号}  # 版本变化时
```

## 💡 技术细节

### 旧方法 vs 新方法

| 方法   | 命令                          | 是否修改工作区 | 风险              |
| ------ | ----------------------------- | -------------- | ----------------- |
| **旧** | `git checkout HEAD~1 -- file` | ✅ 是          | ⚠️ 高（可能失败） |
| **新** | `git show HEAD~1:file`        | ❌ 否          | ✅ 低（只读）     |

### git show 命令说明

```bash
git show HEAD~1:package.json
```

- `HEAD~1`：上一次提交
- `:`：指定文件路径
- `package.json`：目标文件

这个命令**只读取内容**，不修改任何文件。

## ✅ 已完成

- [x] 修复 build 阶段的版本检查
- [x] 修复 merge 阶段的版本检查
- [x] 测试修复方案可行性
- [x] 创建修复说明文档

---

**下一步**：提交更新的 workflow 文件并测试构建！ 🎉
