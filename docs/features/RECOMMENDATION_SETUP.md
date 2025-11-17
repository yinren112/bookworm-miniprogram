# 个性化推荐功能启用指南

## 当前状态

✅ **后端API已就绪** - GET /api/books/recommendations
✅ **前端UI已实现** - 市场页推荐横向滚动卡片
⏸️ **功能已禁用** - 等待CSV推荐数据导入

## 启用步骤

### 1. 准备CSV数据

创建推荐列表CSV文件，格式如下：

```csv
enrollment_year,major,isbn
2023,计算机科学与技术,9787111544937
2023,计算机科学与技术,9787302456747
2024,软件工程,9787115456755
2024,软件工程,9787121234567
```

**字段说明：**
- `enrollment_year`: 入学年份（整数，如 2023）
- `major`: 专业名称（字符串，需与用户画像中的专业完全匹配）
- `isbn`: 书籍ISBN-13（13位数字，必须已存在于BookMaster表中）

### 2. 导入推荐数据

```bash
cd bookworm-backend

# 方法A: 使用Node直接运行
npx tsx src/scripts/import-recommendation-list.ts /path/to/recommendations.csv

# 方法B: 如果已添加npm script
npm run import:recommendations /path/to/recommendations.csv
```

**脚本特性：**
- ✅ 幂等性：可安全重复运行
- ✅ 自动跳过重复项
- ✅ 验证ISBN必须存在于数据库
- ✅ 按(enrollment_year, major)分组创建推荐列表

**输出示例：**
```
Starting CSV import...
Processing 150 rows from recommendations.csv
✓ Created/updated 5 recommendation lists
✓ Inserted 150 book items (skipped 0 duplicates)
Import completed successfully
```

### 3. 启用前端功能

修改 `miniprogram/pages/market/index.wxml` 第12行：

**修改前：**
```html
<view wx:if="{{false}}" class="recommendations-section">
```

**修改后：**
```html
<view wx:if="{{recommendations.length > 0}}" class="recommendations-section">
```

### 4. 验证功能

1. **检查数据库：**
   ```sql
   -- 查看推荐列表
   SELECT * FROM "RecommendedBookList";

   -- 查看某个列表的书籍
   SELECT rbi.*, bs.edition, bm.title
   FROM "RecommendedBookItem" rbi
   JOIN "BookSku" bs ON rbi.sku_id = bs.id
   JOIN "BookMaster" bm ON bs.master_id = bm.id
   WHERE rbi.list_id = 1;
   ```

2. **测试后端API：**
   ```bash
   # 需要用户有UserProfile且匹配某个推荐列表
   curl -H "Authorization: Bearer <user_token>" \
        http://localhost:8080/api/books/recommendations
   ```

3. **小程序测试：**
   - 使用员工账号创建收购记录，包含customerProfile
   - 切换到顾客账号登录
   - 打开市场页，应看到"为你推荐"横向滚动区域
   - 点击推荐卡片，自动搜索该ISBN的书籍

## 工作原理

### 推荐匹配逻辑

```
用户画像(UserProfile)
  ↓ enrollment_year + major
推荐列表(RecommendedBookList)
  ↓ list_id
推荐书目(RecommendedBookItem)
  ↓ sku_id
书籍SKU(BookSku) → 库存(InventoryItem)
```

**过滤规则：**
- 只返回状态为 `in_stock` 的库存
- 计算每本书的最低价格
- 统计可用库存数量
- 无库存的书籍不显示

### 前端交互

1. **加载时机：**
   - onShow() - 每次显示页面
   - onPullDownRefresh() - 下拉刷新

2. **失败处理：**
   - 静默失败，不显示错误提示
   - 避免干扰主市场页体验

3. **点击行为：**
   - 点击推荐卡片 → 自动填充ISBN到搜索框
   - 触发搜索 → 展示该书的所有可售副本

## 故障排查

### 推荐列表为空

**原因1：用户无画像**
```sql
-- 检查用户是否有画像
SELECT * FROM "UserProfile" WHERE user_id = <user_id>;
```

**原因2：专业/年级不匹配**
```sql
-- 检查是否有匹配的推荐列表
SELECT * FROM "RecommendedBookList"
WHERE enrollment_year = 2023 AND major = '计算机科学与技术';
```

**原因3：推荐书籍无库存**
```sql
-- 检查推荐的书是否有库存
SELECT bs.id, bm.title,
       COUNT(ii.id) FILTER (WHERE ii.status = 'in_stock') as stock_count
FROM "RecommendedBookItem" rbi
JOIN "BookSku" bs ON rbi.sku_id = bs.id
JOIN "BookMaster" bm ON bs.master_id = bm.id
LEFT JOIN "InventoryItem" ii ON ii.sku_id = bs.id
WHERE rbi.list_id = <list_id>
GROUP BY bs.id, bm.title;
```

### CSV导入失败

**错误：ISBN不存在**
```
Error: Book with ISBN 9781234567890 not found
```
→ 先将该书籍添加到库存，或从CSV中删除该行

**错误：CSV格式错误**
```
Error: Missing required columns
```
→ 确保CSV有表头行：`enrollment_year,major,isbn`

## 数据维护

### 更新推荐列表

直接重新运行导入脚本：
```bash
npx tsx src/scripts/import-recommendation-list.ts updated-recommendations.csv
```

脚本会：
- 更新已存在的列表
- 添加新书籍（自动跳过重复）

### 删除推荐列表

```sql
-- 删除某个专业的所有推荐
DELETE FROM "RecommendedBookItem"
WHERE list_id IN (
  SELECT id FROM "RecommendedBookList"
  WHERE major = '已停招专业'
);

DELETE FROM "RecommendedBookList"
WHERE major = '已停招专业';
```

## 扩展性考虑

当前设计已支持：
- ✅ 多年级多专业（通过组合键分组）
- ✅ 同一本书的多个版本（通过SKU区分）
- ✅ 动态库存过滤（只显示有货）
- ✅ 价格自动计算（展示最低价）

未来可扩展：
- [ ] 添加推荐权重/排序
- [ ] 添加推荐原因标签
- [ ] 添加推荐有效期
- [ ] 支持通过Web界面管理推荐列表
