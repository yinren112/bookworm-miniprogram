# Findings

## 课程导入
- 课程包目录：`待导入课程/`
- 教程：`待导入课程/复习模块课程导入完整教程.md`
- 课程清单（以 manifest.json 为准）：
  - `待导入课程/市场营销/MARKETING001_CONSUMER/`
  - `待导入课程/风景园林/LANDSCAPE001_PRINCIPLES/`
- 该目录下仅发现 2 份 `manifest.json`，未发现第 3 门课程包。
- 导入工具：`bookworm-backend/scripts/import_course_client.js`
- 导入接口鉴权：`POST /api/study/admin/import` 需要 `STAFF` 角色 JWT
- 开发环境登录特性：`/api/auth/login` 在非 prod/staging 会固定返回 `mock-openid-dev-fixed-user`（不依赖真实微信）
