---
description: "向库存中添加一本新书，并返回创建的记录。"
allowed-tools:
  - "Bash(curl*)"
argument-hint: "[isbn13] [title] [condition A/B/C] [cost] [selling_price]"
---
使用 curl 向本地运行的 bookworm-backend 服务发送一个 POST 请求，以添加一本新书。

请求的 JSON body 应该包含以下字段：
- isbn13: $1
- title: $2
- condition: $3
- cost: $4 (number)
- selling_price: $5 (number)

请求的目标 URL 是 http://localhost:3000/api/inventory/add

请注意，你必须构造一个能在所有平台（包括 Windows PowerShell）上都能工作的 curl 命令。一个健壮的方式是明确调用 curl.exe 并将 JSON body 放在单引号内。