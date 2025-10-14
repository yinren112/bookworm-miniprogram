# 个性化书籍推荐系统 API 文档

## 概述

本系统实现了基于用户画像的书籍推荐功能，在"按本收购"流程中收集用户信息，并提供个性化推荐。

## 数据结构

### UserProfile（用户画像）
```typescript
{
  user_id: number;          // 用户ID（主键）
  phone_number?: string;    // 手机号
  enrollment_year?: number; // 入学年份（静态数据）
  major?: string;           // 专业
  class_name?: string;      // 班级
  updated_at: Date;         // 更新时间
}
```

### RecommendedBookList（推荐书单）
```typescript
{
  id: number;
  enrollment_year: number;  // 入学年份
  major: string;            // 专业
}
```

### RecommendedBookItem（推荐书目）
```typescript
{
  list_id: number;  // 书单ID
  sku_id: number;   // 书籍SKU ID
}
```

## API 端点

### 1. 创建收购记录（含用户画像）

**POST** `/api/acquisitions`

**认证**: 需要 STAFF 角色

**请求体**:
```json
{
  "customerUserId": 123,
  "items": [
    {
      "skuId": 1,
      "condition": "GOOD",
      "acquisitionPrice": 2500
    }
  ],
  "settlementType": "CASH",
  "notes": "测试收购",
  "customerProfile": {
    "phoneNumber": "13800138000",
    "enrollmentYear": 2024,
    "major": "计算机科学与技术",
    "className": "计科2401"
  }
}
```

**响应** (201 Created):
```json
{
  "id": 1,
  "staff_user_id": 2,
  "customer_user_id": 123,
  "total_value": 2500,
  "item_count": 1,
  "settlement_type": "CASH",
  "voucher_code": null,
  "notes": "测试收购",
  "created_at": "2025-10-11T10:00:00.000Z"
}
```

**行为**:
- 如果提供了 `customerProfile` 和 `customerUserId`，会自动创建或更新用户画像
- 使用 `upsert` 操作，幂等且支持增量更新
- 所有操作在单个事务中完成

### 2. 获取个性化推荐

**GET** `/api/books/recommendations`

**认证**: 需要用户登录

**响应** (200 OK):
```json
{
  "recommendations": [
    {
      "skuId": 1,
      "isbn": "9787111594251",
      "title": "深入理解计算机系统（原书第3版）",
      "author": "Randal E. Bryant",
      "publisher": "机械工业出版社",
      "originalPrice": 139.00,
      "edition": "原书第3版",
      "coverImageUrl": null,
      "availableCount": 3,
      "minPrice": 4500
    }
  ],
  "count": 1
}
```

**行为**:
- 根据用户的 `enrollment_year` 和 `major` 查找推荐书单
- 只返回当前有库存（`status = 'in_stock'`）的书籍
- 计算每本书的最低售价
- 如果用户没有画像或没有匹配的推荐列表，返回空数组
- 使用高效的 JOIN 查询，避免 N+1 问题

## 数据导入

### 导入推荐书单

使用 CSV 文件导入推荐数据：

```bash
npx ts-node src/scripts/import-recommendation-list.ts recommendations.csv
```

**CSV 格式**:
```csv
enrollment_year,major,isbn
2023,计算机科学与技术,9787111594251
2023,计算机科学与技术,9787115428868
2024,软件工程,9787111594251
```

**特性**:
- 幂等操作，可重复运行
- 自动跳过重复的书目
- 自动解析 ISBN 到 SKU ID
- 详细的日志输出

## 实现细节

### 数据分离原则
- `User` 与 `UserProfile` 分离（1:1 关系）
- 核心身份信息在 `User` 表
- 可变画像信息在 `UserProfile` 表

### 动态计算原则
- 存储 `enrollment_year`（静态），而非"年级"（可计算）
- 当需要年级时，在应用层计算：`currentYear - enrollment_year + 1`

### 性能优化
- 推荐查询使用单次 JOIN，包含所有关联数据
- 避免 N+1 查询问题
- 使用 Prisma 的 `include` 和 `select` 优化查询

### 事务安全
- 收购+画像更新在单个 Serializable 事务中
- 自动回滚确保数据一致性
- 支持事务重试（处理序列化冲突）

## 使用场景

### 场景1: 首次收购
1. 员工扫码书籍
2. 系统验证 ISBN（`GET /api/acquisitions/check`）
3. 员工收集用户信息（手机、年份、专业、班级）
4. 创建收购记录（`POST /api/acquisitions`）
5. 系统自动创建 `UserProfile`

### 场景2: 重复收购
1. 同一用户再次卖书
2. 员工可选择更新用户信息
3. 系统使用 `upsert` 更新 `UserProfile`
4. 保持最新的用户画像

### 场景3: 小程序首页
1. 用户打开小程序
2. 调用 `GET /api/books/recommendations`
3. 系统根据用户画像返回推荐书籍
4. 前端展示"为你推荐"书单

## 数据库约束

- `UserProfile.user_id` 为主键，确保每个用户只有一个画像
- `(enrollment_year, major)` 联合唯一索引，防止重复书单
- `(list_id, sku_id)` 联合主键，防止重复书目
- 所有时间戳使用 `TIMESTAMPTZ(6)` 精确到微秒

## 错误处理

- 如果 ISBN 不存在于 `BookMaster`，导入脚本会警告但不会失败
- 如果用户没有画像，推荐 API 返回空数组（不报错）
- 如果找不到匹配的推荐列表，返回空数组（不报错）
- 事务失败会自动回滚，确保数据一致性
