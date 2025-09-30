---
description: "审查代码库中违反核心架构约定的模式，例如缺少TypeBox校验或错误的依赖注入。"
---
请审查整个代码库，找出以下两种违反核心架构约定的问题：

1.  **路径参数缺少类型安全校验**: 找出所有使用了 `request.params as ...` 或 `parseInt(request.params...)` 的路由，而没有使用 TypeBox 的 `schema: { params: ... }` 进行验证的实例。列出所有违规的文件和行号。

2.  **服务函数违反依赖注入**: 找出所有在 `src/services/` 目录下的函数，它们直接 `import prisma from '../db'` 并使用全局的 `prisma` 实例，而不是通过函数参数接收 `dbCtx`。列出所有违规的函数。

根据你的发现，生成一份简要的修复计划。