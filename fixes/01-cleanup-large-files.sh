#!/bin/bash
# 修复脚本 01: 清理大文件与迁移k6工具
# 风险: 低 | 工时: 30分钟 | 分类: chore(repo)
# 注意: k6工具迁移到tools/k6/保留使用，不删除

set -e

echo "========================================="
echo "清理大文件与异常目录"
echo "========================================="

# 1. 迁移k6工具到tools/k6/ (保留使用)
echo "[1/4] 迁移k6工具到tools/k6/..."
mkdir -p tools/k6
if [ -f "bin/k6.exe" ]; then
  mv bin/k6.exe tools/k6/
  echo "  ✓ 迁移 bin/k6.exe → tools/k6/"
fi
if [ -d "k6-v0.49.0-windows-amd64" ]; then
  mv k6-v0.49.0-windows-amd64/* tools/k6/ 2>/dev/null || true
  rm -rf k6-v0.49.0-windows-amd64/
  echo "  ✓ 迁移 k6目录内容 → tools/k6/"
fi
rm -rf bin/ 2>/dev/null || true
echo "  ✓ 删除空bin/目录"

# 删除k6压缩包(已解压,无需保留)
if [ -f "k6-v0.49.0-windows-amd64.zip" ]; then
  rm -f k6-v0.49.0-windows-amd64.zip
  echo "  ✓ 删除 k6压缩包 (25MB,已解压)"
fi

# 2. 删除大日志文件
echo "[2/4] 删除日志文件..."
rm -f server-out.log server-err.log backend-dev.log 2>/dev/null || true
rm -f k6-buy.log k6-sell.log 2>/dev/null || true
cd bookworm-backend
rm -f server-out.log server-err.log embedded-postgres.log 2>/dev/null || true
rm -f test-output.txt test_output.txt 2>/dev/null || true
cd ..
echo "  ✓ 删除根目录日志 (~4MB)"
echo "  ✓ 删除后端日志"

# 3. 删除异常目录与空文件
echo "[3/4] 删除异常文件..."
rm -rf "C:/" 2>/dev/null || true
rm -f nul 2>/dev/null || true
echo "  ✓ 删除异常目录 C:/"
echo "  ✓ 删除nul文件"

# 4. 更新.gitignore确保不再入库
echo "[4/4] 更新.gitignore..."
cat >> .gitignore <<'GITIGNORE_EOF'

# 大文件与临时文件(2025-10-22添加)
bin/
k6-v0.49.0-windows-amd64/
k6-v0.49.0-windows-amd64.zip
server-out.log
server-err.log
backend-dev.log
k6-*.log
nul
C:/
bookworm-backend/server-out.log
bookworm-backend/server-err.log
bookworm-backend/embedded-postgres.log
bookworm-backend/test-output.txt
bookworm-backend/test_output.txt
GITIGNORE_EOF
echo "  ✓ 更新.gitignore"

echo ""
echo "✅ 清理完成！已删除约12MB日志, k6工具迁移到tools/k6/"
echo ""
echo "k6工具新位置: tools/k6/k6.exe"
echo ""
echo "下一步:"
echo "  git add .gitignore tools/"
echo "  git commit -m 'chore(repo): cleanup logs and migrate k6 to tools/'"
echo ""
echo "【动机】根目录包含大文件和日志(12MB+), k6工具需组织化管理"
echo "【变更】迁移k6到tools/k6/保留使用, 删除日志和异常目录, 更新.gitignore"
echo "【验证】ls -lh | wc -l 应减少; ls tools/k6/ 应看到k6.exe"
echo "【回滚】git revert <sha>"
