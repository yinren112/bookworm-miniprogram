# NEXT STEPS / Deployment Checklist

## 已完成
- ✅ Nginx 反向代理：`api.lailinkeji.com`、`api-staging.lailinkeji.com` 均指向服务器 8080 端口，HTTP→HTTPS 重定向开启。
- ✅ TLS：Let’s Encrypt 证书（含 `lailinkeji.com`、`www`、`api`、`api-staging`），有效期至 2026-02-13，自动续期。
- ✅ 小程序配置：`miniprogram/config.js` 现已映射 trial→`https://api-staging.lailinkeji.com/api`、release→`https://api.lailinkeji.com/api`。

## 待完成
1. **微信业务域名备案**
   - 登录「微信公众平台 → 开发 → 开发设置」。
   - 在“业务域名”中添加 `https://api-staging.lailinkeji.com`、`https://api.lailinkeji.com`。
   - 上传微信提供的校验文件至服务器指向的根目录（通常为 `/var/www/html` 或 Nginx root）。
   - 验证通过后，体验版/正式版才可访问上述域名。

2. **后端服务常驻**
   - 在部署服务器上以守护方式启动后端（建议使用 pm2/systemd）。
     ```bash
     cd /path/to/bookworm-backend
     npm install --production
     npm run build
     npm run start   # 或 pm2 start dist/index.js --name bookworm
     ```
   - 确认 `curl https://api.lailinkeji.com/api/health` 稳定返回 `{ status: "ok" }`。

3. **体验版验证**
   - 在微信开发者工具中切换到 trial 环境，确保请求命中 `https://api-staging.lailinkeji.com/api`。
   - 验证登录、下单、推荐、库存等接口，记录截图和设备信息，准备人工验收材料。

4. **CI / 集成测试改造**
   - 评估恢复 `globalSetup.testcontainers.ts`，在 CI 中自动拉起 Postgres。
   - 或在 CI 流水线执行前使用 `docker compose --profile test up -d postgres_test`。
   - 将 `npm run test:integration` 纳入强制步骤。

5. **文档同步**
   - 在 `DEPLOYMENT_READINESS.md` 和 `docs/DEPLOYMENT_RUNBOOK.md`（编写中）记录：
     - 域名/证书管理流程。
     - Nginx 配置位置 `/etc/nginx/sites-available/api.lailinkeji.conf`。
     - 后端启动/重启命令、日志路径。

## 负责人
- 微信域名备案：@frontend + @ops
- 后端常驻进程/监控：@backend-infra
- CI 集成测试：@backend-infra
- 体验版验收：@product + QA
- 文档同步：@ops + @backend

> 完成以上步骤后，请更新 `PROGRESS_STATUS.md` 与 `DEPLOYMENT_READINESS.md`，保持状态闭环。*** End Patch
