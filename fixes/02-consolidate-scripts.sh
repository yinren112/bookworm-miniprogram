#!/bin/bash
# 修复脚本 02: 整合临时脚本与配置
# 风险: 低 | 工时: 1小时 | 分类: chore(ops)
# 注意: 保留审查v3.py在根目录(用户要求)

set -e

echo "========================================="
echo "整合临时脚本到ops/与tools/目录"
echo "========================================="

# 1. 创建目标目录结构
echo "[1/5] 创建目录结构..."
mkdir -p ops/archive/scripts
mkdir -p ops/db/seeds
mkdir -p ops/docker
mkdir -p tools/load-testing
mkdir -p tools/monitoring
echo "  ✓ 创建目录"

# 2. 迁移Python审查脚本(归档) - 保留审查v3.py
echo "[2/5] 归档历史审查脚本..."
if [ -f "审查.py" ]; then
  mv "审查.py" ops/archive/scripts/
  echo "  ✓ 迁移 审查.py"
fi
if [ -f "审查 (v2 - 带脱敏功能).py" ]; then
  mv "审查 (v2 - 带脱敏功能).py" ops/archive/scripts/
  echo "  ✓ 迁移 审查 (v2 - 带脱敏功能).py"
fi
if [ -f "审查v2.py" ]; then
  mv "审查v2.py" ops/archive/scripts/
  echo "  ✓ 迁移 审查v2.py"
fi
# 审查v3.py 保留在根目录
echo "  ℹ️  保留 审查v3.py 在根目录(用户要求)"

if [ -f "fix_transactions.py" ]; then
  mv fix_transactions.py ops/archive/scripts/
  echo "  ✓ 迁移 fix_transactions.py"
fi
if [ -f "bookworm_code_review_v2.txt" ]; then
  mv bookworm_code_review_v2.txt ops/archive/
  echo "  ✓ 迁移 bookworm_code_review_v2.txt"
fi
# bookworm_code_review_v3.txt 可以保留或归档(根据需要)
if [ -f "bookworm_code_review_v3.txt" ]; then
  mv bookworm_code_review_v3.txt ops/archive/
  echo "  ✓ 迁移 bookworm_code_review_v3.txt"
fi

# 3. 迁移运维脚本
echo "[3/5] 迁移运维工具..."
if [ -f "load-test.js" ]; then
  mv load-test.js tools/load-testing/
  echo "  ✓ 迁移 load-test.js"
fi
if [ -f "load-test-v2.js" ]; then
  mv load-test-v2.js tools/load-testing/
  echo "  ✓ 迁移 load-test-v2.js"
fi
if [ -f "update_user_metrics.js" ]; then
  mv update_user_metrics.js tools/monitoring/
  echo "  ✓ 迁移 update_user_metrics.js"
fi
if [ -f "test_metrics.sh" ]; then
  mv test_metrics.sh tools/monitoring/
  echo "  ✓ 迁移 test_metrics.sh"
fi

# 4. 迁移运维配置与seed数据
echo "[4/5] 迁移配置与数据..."
if [ -f "seed-staging.sql" ]; then
  mv seed-staging.sql ops/db/seeds/
  echo "  ✓ 迁移 seed-staging.sql"
fi
if [ -f "docker-compose.monitoring.yml" ]; then
  mv docker-compose.monitoring.yml ops/docker/
  echo "  ✓ 迁移 docker-compose.monitoring.yml"
fi
if [ -f "docker-compose.staging.yml" ]; then
  mv docker-compose.staging.yml ops/docker/
  echo "  ✓ 迁移 docker-compose.staging.yml"
fi

# 5. 创建README说明归档策略
echo "[5/5] 生成README..."
cat > ops/archive/README.md <<'README_EOF'
# ops/archive/

此目录存放历史审查产物与一次性脚本。

## scripts/
- `审查.py`: 代码库审查生成器v1(Python)
- `审查v2.py`: 代码库审查生成器v2(Python)
- `审查 (v2 - 带脱敏功能).py`: v2带脱敏版本
- `fix_transactions.py`: 历史数据修复脚本

**注意**: `审查v3.py` 保留在根目录继续使用

## 根级文件
- `bookworm_code_review_v*.txt`: AI生成的历史审查报告

**归档策略**:
- 保留6个月
- 若需长期保留,移至独立文档仓库
README_EOF
echo "  ✓ 生成归档说明"

echo ""
echo "✅ 整合完成！"
echo ""
echo "保留在根目录的文件:"
echo "  - 审查v3.py (用户要求)"
echo "  - AGENTS.md (AI配置)"
echo "  - CLAUDE.md (AI指令)"
echo ""
echo "下一步:"
echo "  git add ops/ tools/"
echo "  git commit -m 'chore(ops): consolidate scripts and configs, keep 审查v3.py'"
echo ""
echo "【动机】根目录散落多个临时脚本/配置,需组织化管理"
echo "【变更】迁移历史审查脚本到ops/archive/, 工具到tools/, 配置到ops/docker/"
echo "【保留】审查v3.py, AGENTS.md, CLAUDE.md 保持根目录(用户要求)"
echo "【验证】ls | wc -l 应减少; ls ops/archive/scripts/ 应看到旧版审查脚本"
echo "【回滚】git revert <sha>"
