# E3 同意落盘验证

## 写入键名
- termsAccepted
- termsAcceptedAt
- termsVersion

## 复现步骤
1. 打开协议页，点击“同意并继续”。
2. 在开发者工具 Storage 面板查看本地存储：
   - `termsAccepted` 为 `true`
   - `termsAcceptedAt` 为 ISO 时间
   - `termsVersion` 为 `v1`

## app.globalData 同步策略
- 协议页在写入 Storage 后同步更新：
  - `app.globalData.termsAccepted = true`
  - `app.globalData.termsAcceptedAt = <写入时间>`
  - `app.globalData.termsVersion = v1`
- 本次运行立即生效，无需重启。
