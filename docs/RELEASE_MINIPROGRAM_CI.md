# 小程序发布链路（miniprogram-ci）

本文目标：把“体验版上传 / 预览二维码产出”变成可重复执行的命令，而不是手工点开发者工具。

## 前置条件（不满足就别跑命令）

### 1) 账号与权限
- 小程序管理员或具备“上传代码”权限的成员账号。
- 在微信公众平台生成并下载“上传密钥”（私钥文件），私钥必须走密钥管理，不入库。

### 2) IP 白名单（CI 必要）
- 公众平台后台配置“IP 白名单”，把 CI 出口 IP 加进去，否则上传会被拒绝。
- 本机执行可不依赖白名单，但上线链路必须按 CI 口径配置。

### 3) 项目配置
- `miniprogram/project.config.json` 中 `appid`、`projectname` 需与实际小程序匹配。
- `miniprogram/` 目录可被 miniprogram-ci 读取（CI 中通常是仓库 checkout 后的相对路径）。

## 安装与版本校验

推荐用 npm 全局安装（CI 中也可缓存）：

```bash
npm install -g miniprogram-ci
miniprogram-ci --version
```

如果 CI 不允许全局安装，可在流水线中用 `npx`（会走网络与缓存策略）：

```bash
npx miniprogram-ci --version
```

## 预览（生成二维码）

示例参数（需要替换为你的私钥路径与版本信息）：

```bash
miniprogram-ci preview \
  --project ./miniprogram \
  --private-key-path ./secrets/wx_upload_private.key \
  --desc "preview: <git-sha>" \
  --qrcode-output-dest ./artifacts/preview.png
```

约定：
- `--desc`：使用 `git` 短哈希或 CI build number，保证可追溯。
- `--qrcode-output-dest`：输出到 `artifacts/`，便于 CI 收集归档。

## 上传体验版

```bash
miniprogram-ci upload \
  --project ./miniprogram \
  --private-key-path ./secrets/wx_upload_private.key \
  --version "0.0.0" \
  --desc "upload: <git-sha>"
```

版本号策略（建议）：
- `--version` 使用语义化版本或日期版本（例如 `2025.12.18`）。
- 回滚策略：保留最近 N 次可用上传记录，并在 `--desc` 写入对应 git 哈希。

## 常见失败与排查

- `invalid ip`：IP 白名单未配置或 CI 出口 IP 变化。
- `private key`/`permission`：上传密钥错误或账号无上传权限。
- `appid mismatch`：`project.config.json` 的 `appid` 与后台不一致。

