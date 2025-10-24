# fixes/ 目录说明

此目录包含Bookworm代码库地毯式审查后的修复脚本与补丁。

## 重要说明

**保留在根目录的文件(不迁移)**:
- ✅ `审查v3.py` - 当前使用的审查脚本
- ✅ `AGENTS.md` - AI Agent配置
- ✅ `CLAUDE.md` - Claude Code AI指令
- ✅ `REPORT.md` - 本次审查报告
- ✅ `README.md` - 项目说明
- ✅ `CHANGELOG.md` - 版本历史
- ✅ `SECURITY_NOTES.md` - 安全文档

## 文件清单

| 文件 | 用途 | 风险等级 | 预估工时 |
|------|------|---------|---------|
| `01-cleanup-large-files.sh` | 清理日志,迁移k6到tools/ | 🟢 低 | 30分钟 |
| `02-consolidate-scripts.sh` | 整合脚本(保留审查v3.py) | 🟢 低 | 1小时 |
| `03-migrate-data-files.sh` | 迁移CSV到data/seeds/ | 🟡 中 | 30分钟 |
| `04-fix-prisma-config.patch` | 修复Prisma弃用配置 | 🟡 中 | 30分钟 |
| `05-consolidate-docs.sh` | 整合文档到docs/ | 🟢 低 | 2小时 |
| `06-rewrite-readme.md` | README.md重写模板 | 🟢 低 | 1小时 |
| `07-ci-gates.yml` | CI守门增强配置 | 🟢 低 | 1小时 |

## 执行顺序

**阶段一: 清理(P0级)**
```bash
# 1. 清理日志并迁移k6工具到tools/k6/
bash fixes/01-cleanup-large-files.sh
git add .gitignore tools/
git commit -m "chore(repo): cleanup logs and migrate k6 to tools/"

# 验证k6迁移成功
ls tools/k6/k6.exe
```

**阶段二: 组织(P1级)**
```bash
# 2. 整合脚本和配置(保留审查v3.py, AGENTS.md, CLAUDE.md)
bash fixes/02-consolidate-scripts.sh
git add ops/ tools/
git commit -m "chore(ops): consolidate scripts and configs, keep 审查v3.py"

# 验证保留的文件仍在根目录
ls 审查v3.py AGENTS.md CLAUDE.md

# 3. 迁移CSV数据文件
bash fixes/03-migrate-data-files.sh
# ⚠️ 手动编辑 bookworm-backend/prisma/seed.ts 更新CSV路径
cd bookworm-backend && npm run seed  # 验证
cd ..
git add data/ bookworm-backend/prisma/seed.ts
git commit -m "chore(data): move seed CSV files to data/seeds/"

# 4. 修复Prisma配置
git apply fixes/04-fix-prisma-config.patch
cd bookworm-backend && npm run seed  # 验证
git commit -m "refactor(backend): migrate Prisma seed config to prisma.config.ts"

# 5. 整合文档(保留AGENTS.md, CLAUDE.md在根目录)
bash fixes/05-consolidate-docs.sh
git add docs/
git commit -m "docs: consolidate scattered documentation to docs/"
```

**阶段三: 文档与守门**
```bash
# 6. 重写README
cp fixes/06-rewrite-readme.md README.md
git add README.md
git commit -m "docs: rewrite README to replace cloud development template"

# 7. CI守门增强
# 手动将 fixes/07-ci-gates.yml 内容添加到 .github/workflows/ci-lint-scan.yml
git add .github/workflows/
git commit -m "ci: add documentation and file size gates"
```

## 验证清单

每个脚本执行后运行:
- ✅ `git status` - 确认变更符合预期
- ✅ `npm run lint` (后端) - 确保零错误
- ✅ `npm test` (后端) - 确保测试通过
- ✅ 手动检查保留文件仍在根目录

**最终验证**:
```bash
# 确认关键文件保留在根目录
ls 审查v3.py AGENTS.md CLAUDE.md REPORT.md

# 确认k6工具迁移成功
ls tools/k6/k6.exe

# 确认文档组织正确
ls docs/architecture/ docs/operations/ docs/api/

# 确认根目录清洁
ls | wc -l  # 应显著减少
```

## 回滚方案

所有修复均可通过git revert回滚:
```bash
git revert <commit-sha>
```

对于文件迁移类操作,也可手动恢复:
```bash
git checkout <commit-sha> -- <file-path>
```

## 关键变更说明

### 1. k6工具迁移
- **旧位置**: `bin/k6.exe`, `k6-v0.49.0-windows-amd64/`
- **新位置**: `tools/k6/`
- **原因**: 组织化管理工具,根目录保持清洁
- **影响**: 需要更新使用k6的脚本路径(如load-test.js)

### 2. 保留的审查文件
- **保留**: `审查v3.py` (当前使用版本)
- **归档**: `审查.py`, `审查v2.py`, `审查 (v2 - 带脱敏功能).py`
- **位置**: `ops/archive/scripts/`

### 3. AI配置文件
- `AGENTS.md` - 保持根目录
- `CLAUDE.md` - 保持根目录
- 这是项目的核心AI指令,需要容易访问

## 注意事项

1. **CSV路径更新**: 脚本03需手动编辑`bookworm-backend/prisma/seed.ts`
2. **k6使用更新**: 如有脚本使用k6,需更新路径为`tools/k6/k6.exe`
3. **npm镜像源**: 当前使用淘宝镜像,npm audit不可用,建议切换到官方源执行安全审计
4. **大文件历史清理**: 若需清理git历史中的大文件,使用`git filter-repo`

## 相关文档

- [REPORT.md](../REPORT.md) - 完整审查报告
- [EXECUTION_SUMMARY.md](EXECUTION_SUMMARY.md) - 执行总结
- [CLAUDE.md](../CLAUDE.md) - AI操作指令
- [AGENTS.md](../AGENTS.md) - AI Agent配置
