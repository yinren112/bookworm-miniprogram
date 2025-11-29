# 后续开发任务清单

## 文档概述

本文档记录了推荐系统和收购页面功能的后续开发任务，包括必须完成的测试验证、可选的功能优化和部署前的检查清单。

**最后更新**：2025-01-29
**当前版本**：v1.0 - 混合定价模式 + 学生信息收集

---

## 一、当前功能状态

### ✅ 已完成功能

#### 1.1 推荐系统（完整实现）

**数据库层**：
- ✅ `UserProfile` 表：存储学生画像（enrollment_year, major, class_name）
- ✅ `RecommendedBookList` 表：按专业+年级分组的推荐列表
- ✅ `RecommendedBookItem` 表：推荐列表与书籍SKU的多对多关系
- ✅ 复合唯一索引：`(enrollment_year, major)` 防止重复列表
- ✅ Migration已应用：`20251011170000_add_user_profile_and_recommendations`

**后端API**：
- ✅ `GET /api/books/recommendations`：返回个性化推荐书籍
- ✅ 推荐算法：基于用户 major + enrollment_year 精确匹配
- ✅ 库存过滤：只返回有库存的书籍（status='in_stock'）
- ✅ 优雅降级：无画像/无匹配时返回空数组
- ✅ 数据结构优化：使用Prisma视图抽象（`bookViews.ts`）

**前端集成**：
- ✅ Market页面推荐卡片：横向滚动展示
- ✅ SWR缓存策略：60秒TTL + 后台静默更新
- ✅ 点击推荐：自动填充ISBN到搜索框
- ✅ UI设计：符合V10设计系统

**数据管理**：
- ✅ CSV导入脚本：`src/scripts/import-recommendation-list.ts`
- ✅ 支持GBK/UTF-8编码
- ✅ 行级错误报告和缺失ISBN追踪

**测试覆盖**：
- ✅ 8个集成测试场景全部通过
- ✅ Profile创建/更新/冲突处理
- ✅ 推荐匹配/库存过滤/权限验证

#### 1.2 收购页面升级（完整实现）

**混合定价模式**：
- ✅ 快速模式：按重量计价，总金额平均分配
- ✅ 精确模式：逐本定价，每本书设置品相和价格
- ✅ Tab切换器：清晰的模式切换UI
- ✅ 实时总金额计算：精确模式下自动求和

**学生信息收集**：
- ✅ 入学年份：Picker选择器（当前年份往前推10年）
- ✅ 专业：文本输入（maxLength=100）
- ✅ 班级：文本输入（maxLength=50）
- ✅ 可选填写：不填也能正常提交
- ✅ UI提示："可选，用于个性化推荐"

**API升级**：
- ✅ 从 `createSellOrder` 切换到 `createAcquisition`
- ✅ 支持 `customerProfile` 参数
- ✅ 后端自动upsert `UserProfile`
- ✅ 手机号冲突检测（409 Conflict）

**代码质量**：
- ✅ ESLint检查通过（移除未使用的`createSellOrder`）
- ✅ Pre-commit hooks全部通过
- ✅ 已提交到Git仓库（commit `422a574`）

---

## 二、必须完成的任务（P0 - 阻塞上线）

### 2.1 功能测试验证

**优先级**：🔴 P0 - 必须在上线前完成
**预计时间**：4小时
**负责人**：前端开发 + QA

#### 测试场景清单

##### 场景1：快速模式完整流程
```
前置条件：员工登录，扫描3本可收购书籍
测试步骤：
1. 选择"快速模式"（默认）
2. 输入顾客手机号：13800138000
3. 输入总重量：2.0 kg
4. 输入单价：10.0 元/kg
5. 【可选】填写学生信息：
   - 入学年份：2023
   - 专业：计算机科学与技术
   - 班级：1班
6. 点击"确认收购"

预期结果：
✅ 总金额显示：¥20.00
✅ 提交成功提示："收购成功"
✅ 后端创建3个InventoryItem，每本价格 666分（20元÷3）
✅ 如果填写了学生信息，UserProfile表创建/更新成功
✅ 页面自动清空，重置为初始状态
```

##### 场景2：精确模式完整流程
```
前置条件：员工登录，扫描3本可收购书籍
测试步骤：
1. 切换到"精确模式"
2. 输入顾客手机号：13900139000
3. 为每本书设置：
   - 书1：品相=良好，价格=8.00
   - 书2：品相=全新，价格=12.50
   - 书3：品相=可接受，价格=5.00
4. 填写学生信息（年份+专业+班级）
5. 点击"确认收购"

预期结果：
✅ 总金额自动计算：¥25.50
✅ 提交成功
✅ 后端创建3个InventoryItem，价格分别为800/1250/500分
✅ 品相字段正确：GOOD/NEW/ACCEPTABLE
✅ UserProfile正确创建
```

##### 场景3：学生信息可选验证
```
测试步骤：
1. 快速模式，只填写手机号和重量/单价
2. 不填写任何学生信息
3. 提交

预期结果：
✅ 提交成功
✅ 后端payload.customerProfile只包含phoneNumber
✅ UserProfile表不创建新记录（或只有phone字段）
```

##### 场景4：模式切换状态管理
```
测试步骤：
1. 快速模式：输入重量2kg、单价10元/kg
2. 切换到精确模式
3. 观察界面变化
4. 切换回快速模式

预期结果：
✅ 切换到精确模式时：总金额重置为¥0.00
✅ 精确模式UI正确显示（品相选择器+价格输入框）
✅ 切换回快速模式：总金额重新计算为¥20.00
✅ 快速模式UI正确显示（重量+单价输入框）
```

##### 场景5：精确模式价格验证
```
测试步骤：
1. 精确模式，扫描3本书
2. 只为前2本书设置价格，第3本留空
3. 提交

预期结果：
❌ 提交失败
✅ 显示错误提示："请为《书名》设置价格"
✅ submitting状态正确重置为false
```

##### 场景6：重复客户画像更新
```
前置条件：数据库已存在手机号13800138000的UserProfile
测试步骤：
1. 收购时输入相同手机号：13800138000
2. 填写不同的学生信息（专业：软件工程）
3. 提交

预期结果：
✅ 提交成功
✅ UserProfile表执行upsert（更新而非创建）
✅ 专业字段更新为"软件工程"
✅ updated_at时间戳更新
```

##### 场景7：手机号冲突检测
```
前置条件：
- 用户A（ID=1）手机号：13800138000
- 用户B（ID=2）手机号：13900139000

测试步骤：
1. 收购时输入手机号：13900139000
2. 后端尝试将此手机号关联到用户A

预期结果：
❌ 提交失败
✅ 返回409 Conflict错误
✅ 错误提示："手机号已被占用"
```

##### 场景8：推荐功能验证
```
前置条件：
1. 已导入推荐数据（enrollment_year=2023, major=计算机科学与技术）
2. 用户已创建UserProfile（2023级计算机科学与技术）

测试步骤：
1. 该用户登录小程序
2. 访问Market页面

预期结果：
✅ "为你推荐"区域显示
✅ 推荐书籍列表正确（只显示有库存的书）
✅ 点击推荐卡片 → ISBN自动填充到搜索框
✅ SWR缓存生效（60秒内不重复请求）
```

#### 验收标准
- [x] **后端集成测试**：12/12测试通过（原8个 + 新增3个）✅ 2025-11-29
  - [x] 场景1：快速模式（API层验证）
  - [x] 场景3：学生信息可选验证
  - [x] 场景6：重复客户画像更新
  - [x] 场景7：手机号冲突检测（Bug已修复）
  - [x] 场景8：推荐功能验证
  - [x] 代码已提交：commit 550d949
- [ ] **前端手工测试**（待完成，预计2小时）
  - [ ] 场景2：精确模式完整流程（UI交互）
  - [ ] 场景4：模式切换状态管理
  - [ ] 场景5：精确模式价格验证
- [ ] 学生信息正确存储到数据库（后端验证通过，前端待测）
- [ ] 推荐功能正常展示（后端验证通过，前端待测）
- [ ] 无console错误或警告（待前端测试验证）

---

### 2.2 推荐数据准备

**优先级**：🔴 P0 - 必须在上线前完成
**预计时间**：2小时
**负责人**：产品经理 + 后端开发

#### 任务说明

当前推荐系统已完整实现，但缺少实际推荐数据。需要准备各专业的推荐书单。

#### 数据收集步骤

1. **确定目标专业列表**
   ```
   示例专业（根据实际情况调整）：
   - 计算机科学与技术
   - 软件工程
   - 电子信息工程
   - 自动化
   - 机械工程
   - 会计学
   - 金融学
   - 英语
   - ...
   ```

2. **收集各专业必读书籍**
   - 咨询专业老师或学长学姐
   - 参考专业培养方案
   - 优先选择已在库存中的书籍

3. **准备CSV文件**
   ```csv
   enrollment_year,major,isbn
   2023,计算机科学与技术,9787111594251
   2023,计算机科学与技术,9787115428868
   2023,计算机科学与技术,9787115546029
   2024,软件工程,9787111594251
   2024,软件工程,9787302469452
   ```

4. **导入推荐数据**
   ```bash
   cd bookworm-backend
   npx ts-node src/scripts/import-recommendation-list.ts --encoding utf8 recommendations.csv
   ```

5. **验证导入结果**
   - 查看脚本输出的成功/失败统计
   - 检查缺失的ISBN（需要添加到BookSKU表）
   - 在前端验证推荐是否正确显示

#### 交付物
- [ ] 推荐书单CSV文件（至少包含5个专业）
- [ ] 导入脚本执行日志
- [ ] 数据库验证报告（RecommendedBookList表记录数）

---

### 2.3 后端集成测试

**优先级**：🔴 P0 - 必须在上线前完成
**预计时间**：3小时
**负责人**：后端开发

#### 测试任务

虽然推荐系统已有8个集成测试通过，但收购页面的新功能需要补充测试。

#### 新增测试场景

##### 测试1：快速模式API调用
```typescript
// 文件：src/tests/acquisition-with-profile.integration.test.ts

describe('POST /api/acquisitions - 快速模式', () => {
  it('应该支持按重量计价并平均分配', async () => {
    // 创建3本书的SKU
    const skus = await createTestBookSKUs(3);

    // 快速模式payload
    const payload = {
      items: skus.map(sku => ({
        skuId: sku.id,
        condition: 'GOOD',
        acquisitionPrice: 666  // 20元÷3本
      })),
      settlementType: 'CASH',
      notes: '批量收购 - 3本 (总重2kg, 单价¥10/kg)',
      customerProfile: {
        phoneNumber: '13800138000',
        enrollmentYear: 2023,
        major: '计算机科学与技术',
        className: '1班'
      }
    };

    const response = await request(app.server)
      .post('/api/acquisitions')
      .set('Authorization', `Bearer ${staffToken}`)
      .send(payload)
      .expect(201);

    // 验证UserProfile创建
    const profile = await prisma.userProfile.findUnique({
      where: { user_id: response.body.customerUserId }
    });

    expect(profile).toBeDefined();
    expect(profile.enrollmentYear).toBe(2023);
    expect(profile.major).toBe('计算机科学与技术');
  });
});
```

##### 测试2：精确模式API调用
```typescript
it('应该支持逐本定价和不同品相', async () => {
  const skus = await createTestBookSKUs(3);

  const payload = {
    items: [
      { skuId: skus[0].id, condition: 'NEW', acquisitionPrice: 1200 },
      { skuId: skus[1].id, condition: 'GOOD', acquisitionPrice: 800 },
      { skuId: skus[2].id, condition: 'ACCEPTABLE', acquisitionPrice: 500 }
    ],
    settlementType: 'CASH',
    notes: '精确定价收购 - 3本',
    customerProfile: {
      phoneNumber: '13900139000'
    }
  };

  const response = await request(app.server)
    .post('/api/acquisitions')
    .set('Authorization', `Bearer ${staffToken}`)
    .send(payload)
    .expect(201);

  // 验证InventoryItems的品相
  const items = await prisma.inventoryItem.findMany({
    where: { sourceOrderId: response.body.orderId }
  });

  expect(items).toHaveLength(3);
  expect(items.map(i => i.condition).sort()).toEqual(['ACCEPTABLE', 'GOOD', 'NEW']);
});
```

##### 测试3：学生信息可选验证
```typescript
it('应该允许不提供学生信息', async () => {
  const skus = await createTestBookSKUs(1);

  const payload = {
    items: [{ skuId: skus[0].id, condition: 'GOOD', acquisitionPrice: 1000 }],
    settlementType: 'CASH',
    customerProfile: {
      phoneNumber: '13700137000'
      // 不提供enrollmentYear, major, className
    }
  };

  await request(app.server)
    .post('/api/acquisitions')
    .set('Authorization', `Bearer ${staffToken}`)
    .send(payload)
    .expect(201);

  // UserProfile应该只有phone字段
  // 或者不创建UserProfile（取决于后端实现）
});
```

#### 执行清单
- [ ] 创建新测试文件：`acquisition-with-profile.integration.test.ts`
- [ ] 实现3个新测试场景
- [ ] 运行 `npm run test:integration`
- [ ] 确保所有测试通过（包括原有的8个推荐测试）
- [ ] 代码覆盖率达到80%以上

---

## 三、推荐完成的任务（P1 - 提升体验）

### 3.1 数据预填充功能

**优先级**：🟡 P1 - 提升用户体验
**预计时间**：2小时
**价值**：减少重复输入，提升员工效率

#### 实现方案

当输入手机号后，自动查询是否已有UserProfile，如果有则回填表单。

**前端修改**（`miniprogram/pages/acquisition-scan/index.js`）：

```javascript
/**
 * 手机号输入事件（增强版）
 */
async onPhoneInput(e) {
  const phone = e.detail.value;
  this.setData({ customerPhone: phone });

  // 如果手机号输入完整（11位），查询是否已有画像
  if (phone.length === 11) {
    try {
      const { getUserProfileByPhone } = require('../../utils/api');
      const profile = await getUserProfileByPhone(phone);

      if (profile) {
        // 自动回填学生信息
        const yearIndex = this.data.yearRange.findIndex(
          y => parseInt(y) === profile.enrollmentYear
        );

        this.setData({
          enrollmentYear: profile.enrollmentYear,
          enrollmentYearIndex: yearIndex >= 0 ? yearIndex : 0,
          major: profile.major || '',
          className: profile.className || ''
        });

        wx.showToast({
          title: '已自动填充学生信息',
          icon: 'success',
          duration: 1500
        });
      }
    } catch (error) {
      // 静默处理（可能是新用户）
    }
  }
}
```

**后端新增API**（`src/routes/users.ts`）：

```typescript
// GET /api/users/profile-by-phone?phone=13800138000
fastify.get(
  '/api/users/profile-by-phone',
  {
    preHandler: [fastify.authenticate, fastify.requireStaff],
    schema: {
      querystring: Type.Object({
        phone: PhoneNumberSchema
      })
    }
  },
  async (request, reply) => {
    const { phone } = request.query;

    const user = await prisma.user.findUnique({
      where: { phone_number: phone },
      include: {
        userProfile: {
          select: {
            enrollment_year: true,
            major: true,
            class_name: true
          }
        }
      }
    });

    if (!user || !user.userProfile) {
      return reply.status(404).send({ error: 'Profile not found' });
    }

    return {
      enrollmentYear: user.userProfile.enrollment_year,
      major: user.userProfile.major,
      className: user.userProfile.class_name
    };
  }
);
```

#### 验收标准
- [ ] 输入已存在的手机号后，学生信息自动回填
- [ ] 输入新手机号时，不报错，表单保持空白
- [ ] 回填提示友好（Toast提示）

---

### 3.2 专业下拉列表

**优先级**：🟡 P1 - 减少输入错误
**预计时间**：1.5小时
**价值**：规范专业名称，提升数据质量

#### 实现方案

将专业输入框改为Picker选择器，预设常见专业列表。

**数据源**（`miniprogram/pages/acquisition-scan/index.js`）：

```javascript
data: {
  // ...现有字段...

  // 新增：专业列表
  majorList: [
    '计算机科学与技术',
    '软件工程',
    '网络工程',
    '数据科学与大数据技术',
    '电子信息工程',
    '自动化',
    '机械工程',
    '会计学',
    '金融学',
    '工商管理',
    '英语',
    '其他（手动输入）'
  ],
  majorIndex: 0,
  customMajor: ''  // 用户自定义专业
}
```

**UI修改**（`miniprogram/pages/acquisition-scan/index.wxml`）：

```xml
<!-- 专业选择器 -->
<view class="input-row">
  <text class="input-label">专业:</text>
  <picker
    class="major-picker"
    mode="selector"
    range="{{majorList}}"
    value="{{majorIndex}}"
    bindchange="onMajorChange">
    <view class="picker-display">
      {{major || '请选择'}}
    </view>
  </picker>
</view>

<!-- 如果选择了"其他"，显示手动输入框 -->
<view wx:if="{{majorIndex === majorList.length - 1}}" class="input-row">
  <text class="input-label">请输入专业:</text>
  <input
    class="text-input"
    type="text"
    value="{{customMajor}}"
    bindinput="onCustomMajorInput"
    placeholder="请输入完整专业名称"
    maxlength="100" />
</view>
```

**事件处理**：

```javascript
onMajorChange(e) {
  const index = e.detail.value;
  const selectedMajor = this.data.majorList[index];

  this.setData({
    majorIndex: index,
    major: selectedMajor === '其他（手动输入）' ? '' : selectedMajor
  });
},

onCustomMajorInput(e) {
  this.setData({
    customMajor: e.detail.value,
    major: e.detail.value
  });
}
```

#### 验收标准
- [ ] 专业列表包含至少10个常见专业
- [ ] 选择"其他"时显示手动输入框
- [ ] 手动输入的专业正确提交到后端

---

### 3.3 精确模式批量品相设置

**优先级**：🟡 P1 - 提升效率
**预计时间**：1小时
**价值**：快速为所有书设置相同品相

#### 实现方案

在精确模式顶部添加"批量设置品相"按钮。

**UI新增**（`miniprogram/pages/acquisition-scan/index.wxml`）：

```xml
<!-- 精确模式：逐本定价 -->
<view wx:if="{{pricingMode === 'individual'}}" class="individual-pricing">
  <view class="pricing-header">
    <text class="pricing-hint">为每本书设置品相和价格</text>

    <!-- 批量品相设置 -->
    <view class="batch-condition-setter">
      <text class="batch-label">批量品相:</text>
      <picker
        class="batch-condition-picker"
        mode="selector"
        range="{{['全新', '良好', '可接受']}}"
        bindchange="onBatchConditionChange">
        <view class="batch-picker-display">点击批量设置</view>
      </picker>
    </view>
  </view>

  <!-- 原有的逐本定价列表 -->
  ...
</view>
```

**事件处理**：

```javascript
/**
 * 批量设置品相
 */
onBatchConditionChange(e) {
  const value = parseInt(e.detail.value);
  const conditionMap = ['NEW', 'GOOD', 'ACCEPTABLE'];
  const condition = conditionMap[value];

  const items = this.data.scannedItems.map(item => ({
    ...item,
    conditionIndex: value,
    condition: condition
  }));

  this.setData({ scannedItems: items });

  wx.showToast({
    title: `已将所有书设为${['全新', '良好', '可接受'][value]}`,
    icon: 'success',
    duration: 1500
  });
}
```

#### 验收标准
- [ ] 批量设置后，所有可收购书籍的品相同步更新
- [ ] 用户仍可单独修改某本书的品相
- [ ] UI提示友好

---

### 3.4 价格建议功能

**优先级**：🟡 P1 - 辅助决策
**预计时间**：3小时
**价值**：帮助员工快速定价

#### 实现方案

在精确模式中，根据书籍原价自动建议收购价。

**建议规则**：
- 全新：原价 × 70%
- 良好：原价 × 50%
- 可接受：原价 × 30%

**后端增强**（`checkAcquisition` API返回建议价格）：

```typescript
// src/services/acquisitionService.ts
export async function checkAcquisitionEligibility(isbn: string) {
  // ...现有逻辑...

  return {
    acquirableSkus: eligibleSkus.map(sku => ({
      skuId: sku.id,
      isbn: sku.isbn,
      title: sku.title,
      author: sku.author,
      originalPrice: sku.originalPrice,
      // 新增：建议价格（分）
      suggestedPrices: {
        NEW: Math.round(sku.originalPrice * 0.7),
        GOOD: Math.round(sku.originalPrice * 0.5),
        ACCEPTABLE: Math.round(sku.originalPrice * 0.3)
      }
    }))
  };
}
```

**前端展示**（精确模式价格输入框）：

```xml
<view class="price-input-wrapper">
  <text class="price-prefix">¥</text>
  <input
    class="price-input"
    type="digit"
    value="{{book.individualPrice}}"
    data-index="{{index}}"
    bindinput="onIndividualPriceInput"
    placeholder="{{book.suggestedPrice || '0.00'}}" />
  <text wx:if="{{book.suggestedPrice}}" class="price-hint">
    建议: ¥{{book.suggestedPrice}}
  </text>
</view>
```

#### 验收标准
- [ ] 每本书显示建议价格（基于品相和原价）
- [ ] 建议价格仅作提示，用户可自由修改
- [ ] 如果书籍无原价信息，不显示建议

---

## 四、可选优化任务（P2 - 长期改进）

### 4.1 统计看板

**优先级**：🟢 P2 - 数据分析
**预计时间**：6小时
**价值**：了解用户画像分布

#### 功能描述

为员工提供一个统计看板，展示：
- 各专业的收购书籍数量分布
- 各年级的客户数量
- 最热门的专业书籍Top 10

#### 实现方案

新增员工端统计页面（可选路径：`/admin/stats`）

**后端API**：
```typescript
// GET /api/stats/user-profiles
fastify.get('/api/stats/user-profiles', async (request, reply) => {
  const stats = await prisma.userProfile.groupBy({
    by: ['major', 'enrollment_year'],
    _count: { user_id: true },
    where: {
      major: { not: null }
    }
  });

  return stats;
});
```

#### 验收标准
- [ ] 统计数据准确
- [ ] 支持按时间范围筛选
- [ ] 图表可视化（可选：使用Chart.js）

---

### 4.2 推荐数据管理后台

**优先级**：🟢 P2 - 运营工具
**预计时间**：8小时
**价值**：非技术人员可自行管理推荐

#### 功能描述

开发Web管理后台，支持：
- 查看现有推荐列表
- 新增/删除推荐书籍
- 批量导入CSV（可视化界面）

#### 技术选型

可选方案：
1. 使用现有Admin UI扩展
2. 使用第三方Admin框架（如Retool, AdminJS）
3. 简单的React页面

#### 验收标准
- [ ] 非技术人员可独立操作
- [ ] 支持拖拽排序推荐顺序
- [ ] 变更日志记录（谁在何时修改了哪个推荐列表）

---

### 4.3 推荐算法优化

**优先级**：🟢 P2 - 智能推荐
**预计时间**：12小时
**价值**：更精准的个性化推荐

#### 当前限制

现有推荐算法是简单的精确匹配（major + enrollment_year），无法处理：
- 跨年级通用书籍（如大学英语）
- 相似专业的共享书籍
- 基于购买历史的协同过滤

#### 优化方向

1. **多级匹配**：
   - Level 1：精确匹配（major + year）
   - Level 2：专业匹配（忽略year）
   - Level 3：学科大类匹配（如理工类、文科类）

2. **协同过滤**：
   - "购买了这本书的用户还购买了..."
   - 需要额外的`UserPurchaseHistory`表

3. **热度权重**：
   - 结合库存周转率
   - 最近N天销量

#### 验收标准
- [ ] 推荐准确率提升（通过A/B测试验证）
- [ ] 推荐覆盖率提升（更多用户能看到推荐）
- [ ] 性能不受影响（查询时间 < 100ms）

---

## 五、部署前检查清单

### 5.1 代码审查

- [ ] ESLint检查通过（前端和后端）
- [ ] TypeScript类型检查通过（`npx tsc --noEmit`）
- [ ] 无console.log遗留（除了logger）
- [ ] 无TODO/FIXME注释未处理
- [ ] Git提交信息规范

### 5.2 测试覆盖

- [ ] 所有P0测试场景通过
- [ ] 集成测试通过（`npm run test:integration`）
- [ ] 单元测试覆盖率 ≥ 80%
- [ ] 手工测试报告已提交

### 5.3 数据准备

- [ ] 推荐书单CSV已导入
- [ ] 至少覆盖5个主要专业
- [ ] 数据库Migration已同步到生产环境
- [ ] Prisma client已重新生成（`npx prisma generate`）

### 5.4 性能检查

- [ ] 推荐API响应时间 < 200ms
- [ ] 收购提交API响应时间 < 500ms
- [ ] Market页面加载时间 < 2s
- [ ] 无内存泄漏（前端和后端）

### 5.5 安全检查

- [ ] customerProfile参数经过TypeBox验证
- [ ] 手机号格式严格校验（11位数字）
- [ ] 防止SQL注入（使用Prisma参数化查询）
- [ ] 防止XSS（前端输入sanitize）
- [ ] API权限验证（员工专属接口需requireStaff）

### 5.6 文档更新

- [ ] API文档更新（如有Swagger）
- [ ] README.md更新新功能说明
- [ ] CHANGELOG.md记录版本变更
- [ ] 用户手册更新（如有）

### 5.7 监控配置

- [ ] Prometheus指标添加：
  - `acquisition_with_profile_total`（带画像的收购次数）
  - `recommendation_api_calls_total`（推荐API调用次数）
  - `recommendation_empty_rate`（空推荐率）
- [ ] 错误日志监控（Sentry或类似工具）
- [ ] 数据库慢查询监控

---

## 六、上线计划

### 6.1 灰度发布建议

**阶段1：内部测试**（1-2天）
- 只对内部员工开放
- 收集反馈，快速迭代

**阶段2：小范围试点**（3-5天）
- 选择1-2个专业的学生
- 监控推荐准确率
- 收集用户反馈

**阶段3：全量上线**（第7天）
- 开放给所有用户
- 持续监控关键指标

### 6.2 回滚预案

如果出现严重问题，可快速回滚：

```bash
# 回滚到上一个版本
git revert 422a574

# 或直接切换分支
git checkout 21013aa

# 重新部署
npm run build
pm2 restart bookworm-backend
```

**数据库回滚**：
- UserProfile表可保留（不影响原有功能）
- 如需完全回滚，执行反向migration（需提前准备）

### 6.3 上线后监控指标

**核心指标**：
- 学生信息填写率：目标 > 60%
- 推荐点击率：目标 > 10%
- 收购成功率：目标 > 95%

**异常指标**：
- API错误率 > 5%：立即告警
- 推荐空返回率 > 50%：检查推荐数据
- 数据库连接超时：检查连接池配置

---

## 七、联系方式

**技术问题**：
- 后端负责人：[姓名] - [邮箱]
- 前端负责人：[姓名] - [邮箱]

**产品问题**：
- 产品经理：[姓名] - [邮箱]

**紧急联系**：
- 24小时值班：[电话]

---

## 八、版本历史

| 版本 | 日期 | 变更内容 | 负责人 |
|------|------|----------|--------|
| v1.0 | 2025-01-29 | 初始版本：混合定价模式 + 学生信息收集 | Claude |

---

**最后更新**：2025-01-29
**下次审查**：上线后7天
