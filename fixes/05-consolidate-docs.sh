#!/bin/bash
# 修复脚本 05: 整合分散的文档到docs/
# 风险: 低 | 工时: 2小时 | 分类: docs(repo)
# 注意: AGENTS.md和CLAUDE.md保持在根目录(用户要求)

set -e

echo "========================================="
echo "整合文档到docs/目录"
echo "========================================="

# 1. 创建docs/子目录结构
echo "[1/4] 创建docs/目录结构..."
mkdir -p docs/architecture
mkdir -p docs/operations
mkdir -p docs/testing
mkdir -p docs/api
mkdir -p docs/features
mkdir -p docs/internal
echo "  ✓ 创建目录"

# 2. 迁移架构文档
echo "[2/4] 迁移架构文档..."
mv bookworm-backend/DB_RULES.md docs/architecture/ 2>/dev/null || echo "  (已不存在)"
mv bookworm-backend/REFACTORING_PLAN.md docs/architecture/ 2>/dev/null || echo "  (已不存在)"
mv bookworm-backend/REFACTORING_LOG.md docs/architecture/ 2>/dev/null || echo "  (已不存在)"
echo "  ✓ 迁移3个架构文档"

# 3. 迁移运维与测试文档
echo "[3/4] 迁移运维/测试文档..."
mv PERF_NOTES.md docs/operations/ 2>/dev/null || echo "  (已不存在)"
mv CI_NOTES.md docs/operations/ 2>/dev/null || echo "  (已不存在)"
mv bookworm-backend/CONTRACT_README.md docs/testing/ 2>/dev/null || echo "  (已不存在)"
echo "  ✓ 迁移3个运维/测试文档"

# 4. 迁移功能与API文档
echo "[4/4] 迁移功能/API文档..."
mv RECOMMENDATION_SETUP.md docs/features/ 2>/dev/null || echo "  (已不存在)"
mv bookworm-backend/RECOMMENDATIONS_API.md docs/api/ 2>/dev/null || echo "  (已不存在)"
echo "  ✓ 迁移2个功能文档"

# 5. 生成docs/README.md索引
cat > docs/README.md <<'README_EOF'
# Bookworm 项目文档索引

## 架构文档 (architecture/)
- [DB_RULES.md](architecture/DB_RULES.md) - 数据库事务与并发规则
- [REFACTORING_PLAN.md](architecture/REFACTORING_PLAN.md) - 订单服务重构计划
- [REFACTORING_LOG.md](architecture/REFACTORING_LOG.md) - 重构执行日志

## 运维文档 (operations/)
- [PERF_NOTES.md](operations/PERF_NOTES.md) - 性能优化笔记
- [CI_NOTES.md](operations/CI_NOTES.md) - CI/CD配置说明

## 测试文档 (testing/)
- [CONTRACT_README.md](testing/CONTRACT_README.md) - 契约测试指南

## API文档 (api/)
- [RECOMMENDATIONS_API.md](api/RECOMMENDATIONS_API.md) - 推荐系统API规范

## 功能文档 (features/)
- [RECOMMENDATION_SETUP.md](features/RECOMMENDATION_SETUP.md) - 推荐系统配置

## 根级文档(保留在项目根目录)
- README.md - 项目总览
- CHANGELOG.md - 版本变更历史
- SECURITY_NOTES.md - 安全实践说明
- **CLAUDE.md** - Claude Code AI指令(保持根目录)
- **AGENTS.md** - AI Agent配置(保持根目录)
README_EOF

echo ""
echo "✅ 文档整合完成！"
echo ""
echo "下一步:"
echo "  git add docs/"
echo "  git rm PERF_NOTES.md CI_NOTES.md RECOMMENDATION_SETUP.md"
echo "  git rm bookworm-backend/DB_RULES.md bookworm-backend/REFACTORING_*.md ..."
echo "  git commit -m 'docs: consolidate scattered documentation to docs/'"
echo ""
echo "【动机】13个.md文档散落在根目录与bookworm-backend/,难以维护与查找"
echo "【变更】迁移8个文档到docs/子目录,保留CLAUDE.md/AGENTS.md在根(用户要求)"
echo "【验证】find . -maxdepth 1 -name '*.md' | wc -l 应减少"
echo "【回滚】git revert <sha>"
