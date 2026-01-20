#!/bin/bash
# CI 护栏扫描脚本
# 用途：检测代码中的安全和架构违规模式
# 退出码：如果发现违规，返回非零退出码

set -e  # 遇到错误立即退出

echo "========================================"
echo "CI 护栏扫描开始"
echo "========================================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 违规计数器
VIOLATIONS=0

# ============================================
# 扫描 1: 后端 Prisma select/include 字面量
# ============================================
echo ""
echo -e "${YELLOW}[1/2] 扫描后端 Prisma select/include 字面量...${NC}"

# 检测 .findMany({ select: ... }) 或 .findFirst({ include: ... }) 等模式
# 排除 src/db/views/ 和测试文件
PRISMA_SELECT_VIOLATIONS=$(git grep -nE "prisma\..+\.(findMany|findFirst|findUnique|findUniqueOrThrow)\(\s*\{\s*(select|include)\s*:" -- 'bookworm-backend/src' | grep -v 'src/db/' | grep -v '.test.ts' | grep -v 'src/tests/' || true)

if [ -n "$PRISMA_SELECT_VIOLATIONS" ]; then
  echo -e "${RED}✗ 发现 Prisma select/include 字面量违规:${NC}"
  echo "$PRISMA_SELECT_VIOLATIONS"
  echo ""
  echo -e "${YELLOW}修复建议: 所有 Prisma 查询的 select/include 必须通过 src/db/views/* 出口定义。${NC}"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo -e "${GREEN}✓ 未发现 Prisma select/include 字面量违规${NC}"
fi

# ============================================
# 扫描 2: 前端敏感信息打印
# ============================================
echo ""
echo -e "${YELLOW}[2/2] 扫描前端敏感信息打印...${NC}"

# 检测 console.log/console.debug 包含敏感字段的调用
# 敏感字段: phone, openid, pickupCode, code, phoneNumber, phone_number
SENSITIVE_LOG_VIOLATIONS=$(git grep -nE "console\.(log|debug|info|warn)" -- 'miniprogram' | grep -iE "(phone|openid|pickupCode|code|phoneNumber|phone_number)" || true)

if [ -n "$SENSITIVE_LOG_VIOLATIONS" ]; then
  echo -e "${RED}✗ 发现前端敏感信息打印违规:${NC}"
  echo "$SENSITIVE_LOG_VIOLATIONS"
  echo ""
  echo -e "${YELLOW}修复建议: 禁止在前端代码中打印 phone/openid/pickupCode/code 等敏感信息。${NC}"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo -e "${GREEN}✓ 未发现前端敏感信息打印违规${NC}"
fi

# ============================================
# 扫描 3: 前端 console.log/debug 使用检查
# ============================================
echo ""
echo -e "${YELLOW}[3/5] 扫描前端 console.log/debug 使用...${NC}"

# 检测所有 console.log 和 console.debug 调用（不仅仅是敏感信息）
CONSOLE_LOG_VIOLATIONS=$(git grep -nE "console\.(log|debug)" -- 'miniprogram/**/*.js' 'miniprogram/**/*.wxs' || true)

if [ -n "$CONSOLE_LOG_VIOLATIONS" ]; then
  echo -e "${RED}✗ 发现前端 console.log/debug 违规:${NC}"
  echo "$CONSOLE_LOG_VIOLATIONS"
  echo ""
  echo -e "${YELLOW}修复建议: 前端代码只允许使用 console.error。请移除所有 console.log/debug 调用。${NC}"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo -e "${GREEN}✓ 未发现前端 console.log/debug 违规${NC}"
fi

# ============================================
# 扫描 4: 前端直接使用 wx.request
# ============================================
echo ""
echo -e "${YELLOW}[4/5] 扫描前端直接使用 wx.request...${NC}"

# 检测 wx.request 调用（排除 utils/request.js）
WX_REQUEST_VIOLATIONS=$(git grep -nE "wx\.request\(" -- 'miniprogram/**/*.js' | grep -v 'miniprogram/utils/request.js' || true)

if [ -n "$WX_REQUEST_VIOLATIONS" ]; then
  echo -e "${RED}✗ 发现前端直接使用 wx.request 违规:${NC}"
  echo "$WX_REQUEST_VIOLATIONS"
  echo ""
  echo -e "${YELLOW}修复建议: 禁止直接使用 wx.request，请改用 utils/request.js 或 utils/api.js。${NC}"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo -e "${GREEN}✓ 未发现前端直接使用 wx.request 违规${NC}"
fi

# ============================================
# 扫描 5: Toast/Modal 中的敏感信息
# ============================================
echo ""
echo -e "${YELLOW}[5/5] 扫描 Toast/Modal 中的敏感信息...${NC}"

# 检测 showToast/showModal 调用中包含敏感字段的情况
# 这里使用多行匹配模式来捕获整个调用块
TOAST_SENSITIVE_VIOLATIONS=$(git grep -nE "(showToast|showModal)" -- 'miniprogram/**/*.js' | grep -iE "(phone|openid|pickupCode|code|phoneNumber|phone_number)" || true)

if [ -n "$TOAST_SENSITIVE_VIOLATIONS" ]; then
  echo -e "${RED}✗ 发现 Toast/Modal 包含敏感信息违规:${NC}"
  echo "$TOAST_SENSITIVE_VIOLATIONS"
  echo ""
  echo -e "${YELLOW}修复建议: 禁止在 showToast/showModal 中显示 phone/openid/pickupCode/code 等敏感信息。请使用统一的错误码映射（utils/ui.js）。${NC}"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo -e "${GREEN}✓ 未发现 Toast/Modal 敏感信息违规${NC}"
fi

# ============================================
# 最终结果
# ============================================
echo ""
echo "========================================"
if [ $VIOLATIONS -eq 0 ]; then
  echo -e "${GREEN}✓ 所有扫描通过，未发现违规${NC}"
  echo "========================================"
  exit 0
else
  echo -e "${RED}✗ 发现 $VIOLATIONS 类违规，请修复后重新提交${NC}"
  echo "========================================"
  exit 1
fi
