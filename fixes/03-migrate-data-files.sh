#!/bin/bash
# 修复脚本 03: 迁移数据文件到data/seeds/
# 风险: 中(需更新seed.ts路径) | 工时: 30分钟 | 分类: chore(data)

set -e

echo "========================================="
echo "迁移种子数据文件"
echo "========================================="

# 1. 创建目标目录
echo "[1/3] 创建data/seeds/目录..."
mkdir -p data/seeds
echo "  ✓ 创建目录"

# 2. 迁移CSV文件
echo "[2/3] 迁移CSV数据文件..."
mv ISBN.csv data/seeds/ 2>/dev/null || echo "  (已不存在)"
mv 公共课书单.csv data/seeds/ 2>/dev/null || echo "  (已不存在)"
mv 所有专业都可能需要的公共课.csv data/seeds/ 2>/dev/null || echo "  (已不存在)"
mv 专业课书单.csv data/seeds/ 2>/dev/null || echo "  (已不存在)"
echo "  ✓ 迁移4个CSV文件(~126KB)"

# 3. 创建data/seeds/README.md
echo "[3/3] 生成README..."
cat > data/seeds/README.md <<'README_EOF'
# data/seeds/

种子数据文件,用于初始化开发/测试环境。

## 文件清单
- `ISBN.csv`: ISBN批量导入数据
- `公共课书单.csv`: 公共课教材清单
- `所有专业都可能需要的公共课.csv`: 通识课清单
- `专业课书单.csv`: 专业课教材清单

## 使用方式
```bash
cd bookworm-backend
npm run seed
```

**注意**: bookworm-backend/prisma/seed.ts中需引用这些文件,路径为`../../data/seeds/xxx.csv`
README_EOF
echo "  ✓ 生成说明文档"

echo ""
echo "⚠️  重要: 需要手动更新seed.ts中的CSV路径!"
echo ""
echo "编辑文件: bookworm-backend/prisma/seed.ts"
echo "查找并替换:"
echo "  - './ISBN.csv'  →  '../../data/seeds/ISBN.csv'"
echo "  - 其他CSV文件路径同理"
echo ""
echo "完成后:"
echo "  cd bookworm-backend && npm run seed  # 验证seed脚本仍能运行"
echo "  git add data/ bookworm-backend/prisma/seed.ts"
echo "  git commit -m 'chore(data): move seed CSV files to data/seeds/'"
echo ""
echo "【动机】根目录包含4个CSV数据文件(126KB),应组织到data/目录"
echo "【变更】迁移CSV到data/seeds/, 更新seed.ts路径引用"
echo "【验证】npm run seed执行成功"
echo "【回滚】git revert <sha> && cd bookworm-backend && npm run seed(应失败则需手动恢复)"
