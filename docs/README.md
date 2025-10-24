# Bookworm 项目文档

本目录包含 Bookworm 项目的技术文档、架构设计和运维指南。

## 目录结构

### 📐 Architecture（架构设计）
- [`DB_RULES.md`](architecture/DB_RULES.md) - 数据库设计原则与约束规范
- [`REFACTORING_PLAN.md`](architecture/REFACTORING_PLAN.md) - 重构计划与技术债务管理
- [`REFACTORING_LOG.md`](architecture/REFACTORING_LOG.md) - 重构执行日志

### ⚙️ Operations（运维与性能）
- [`CI_NOTES.md`](operations/CI_NOTES.md) - CI/CD 配置说明与最佳实践
- [`PERF_NOTES.md`](operations/PERF_NOTES.md) - 性能优化笔记与调优指南

### ✨ Features（功能文档）
- [`RECOMMENDATION_SETUP.md`](features/RECOMMENDATION_SETUP.md) - 推荐系统配置与使用指南

### 🔌 API（API 文档）
- [`RECOMMENDATIONS_API.md`](api/RECOMMENDATIONS_API.md) - 推荐系统 API 接口文档

### 🧪 Testing（测试）
_（待添加测试相关文档）_

---

## 文档编写规范

### 格式要求
- 使用 Markdown 格式
- 文件名使用大写加下划线（如 `DB_RULES.md`）
- 包含清晰的标题层级
- 代码示例使用合适的语法高亮

### 维护原则
1. **单一信息源**: 避免重复内容，使用链接引用
2. **及时更新**: 代码变更时同步更新相关文档
3. **实用优先**: 关注实际使用场景，避免过度理论化
4. **版本追踪**: 重要变更在文档中注明日期和版本

---

## 快速导航

### 新人入门
1. 阅读根目录 [`README.md`](../README.md) 了解项目概况
2. 查看 [`architecture/DB_RULES.md`](architecture/DB_RULES.md) 理解数据库设计
3. 参考 [`operations/CI_NOTES.md`](operations/CI_NOTES.md) 配置开发环境

### 开发参考
- **数据库设计**: [`architecture/DB_RULES.md`](architecture/DB_RULES.md)
- **性能优化**: [`operations/PERF_NOTES.md`](operations/PERF_NOTES.md)
- **功能配置**: [`features/`](features/) 目录

### 运维部署
- **CI/CD**: [`operations/CI_NOTES.md`](operations/CI_NOTES.md)
- **监控指标**: 参考根目录 README 的"监控与可观测性"章节

---

## 贡献文档

如需添加或修改文档，请遵循以下流程：

1. **确定文档类别**: 选择合适的子目录（architecture / operations / testing / api / features）
2. **创建草稿**: 在对应子目录创建 Markdown 文件
3. **更新索引**: 在本文件中添加新文档的链接和简要说明
4. **提交 PR**: 文档变更与代码变更一起提交审查

### 文档审查标准
- ✅ 信息准确，与当前代码一致
- ✅ 格式规范，易于阅读
- ✅ 包含实际示例或代码片段
- ✅ 避免泄露敏感信息（密钥、内部URL等）

---

**最后更新**: 2025-10-24
**维护者**: Bookworm 开发团队
