# 课程导入 SOP（给定课程包文件夹，直接导入）

适用场景：你给我一个“已经按规范准备好的课程资料文件夹”，我需要把里面的课程导入后端并发布，尽量少走弯路、少消耗上下文与 token。

## 入口与不变量（固定不变，别再搜索）

- 导入工具：`bookworm-backend/scripts/import_course_client.js`
- 课程包必需文件：`manifest.json`、`units.json`
- 课程包可选目录/文件：`cards/*.tsv`、`questions/*.gift`、`cheatsheets.json`
- 导入 API：`POST /api/study/admin/import`
  - 鉴权要求：JWT 必须带 `role=STAFF`（否则 403）
- 课程列表验证 API：`GET /api/study/courses`（仅返回 `PUBLISHED`）

## 0. 输入约定（你给我的文件夹应该长这样）

你给我的根目录（例：`待导入课程/`）下面应包含多门课程的“课程包目录”，每门课一个目录，目录内有 `manifest.json`：

```
待导入课程/
  某学院/
    COURSEKEY001_XXX/
      manifest.json
      units.json
      cards/*.tsv
      questions/*.gift
      cheatsheets.json
```

如果你说“有 3 门课”，我会以“manifest.json 的数量”为准。缺第 3 份 manifest.json 就等于不存在第 3 门课程包。

## 1. 预检：只做一次的本地扫描（快速确认课程数量与路径）

PowerShell（在仓库根目录执行）：

```powershell
Get-ChildItem ".\待导入课程" -Recurse -Filter "manifest.json" |
  Select-Object FullName
```

得到的每一个 `manifest.json` 所在目录，就是一个要导入的课程包目录。

## 2. 确保后端可用（只验证一次）

- 后端开发服务：在 `bookworm-backend/` 下 `npm run dev`
- 健康检查：`GET http://localhost:8080/api/health`

## 3. 拿到可用于导入的 STAFF Token（最少步骤）

### 3.1 本地开发环境（最快路径，避免微信/浏览器）

事实：开发环境 `/api/auth/login` 会使用固定 mock openid，不需要真实微信 code。

```powershell
$api = "http://localhost:8080"

# 1) 登录拿到普通 token + userId
$login = Invoke-RestMethod -Method Post -Uri "$api/api/auth/login" -ContentType "application/json" -Body '{"code":"dev"}'

# 2) 把该 userId 提升为 STAFF（导入接口要求 role=STAFF）
Push-Location ".\bookworm-backend"
npx ts-node upgrade-user-to-staff.ts $login.userId
Pop-Location

# 3) 重新登录，拿到带 role=STAFF 的 token
$login2 = Invoke-RestMethod -Method Post -Uri "$api/api/auth/login" -ContentType "application/json" -Body '{"code":"dev"}'
$env:BOOKWORM_TOKEN = $login2.token
```

注意：JWT 里 role 是写死进去的；提升角色后必须“重新登录”才能得到 STAFF token。

### 3.2 线上/预发环境（原则）

- 你必须使用真实的 STAFF 账号登录获取 token（或后台已有 Bearer）。
- 不要在命令行里硬编码 token；优先用环境变量 `BOOKWORM_TOKEN`。

## 4. 导入流程（固定套路：dry-run → live import → publish）

进入脚本目录：

```powershell
Push-Location ".\bookworm-backend\scripts"
```

对每一个“课程包目录”（manifest.json 所在目录）执行：

```powershell
# 1) dry-run：只校验格式与可导入性，不写库
node .\import_course_client.js --dry-run <课程包目录>

# 2) 正式导入并发布
node .\import_course_client.js --force --publish <课程包目录>
```

什么时候需要 `--force`：
- 首次导入新课程：可不加 `--force`；但为了幂等与省心，默认加 `--force`。
- 更新已有课程：必须加 `--force`（否则会提示版本已存在）。

结束后退出目录：

```powershell
Pop-Location
```

## 5. 验证（只做两件事，别再发散）

### 5.1 课程列表里能看到（PUBLISHED 才会出现）

```powershell
$api = "http://localhost:8080"
$login = Invoke-RestMethod -Method Post -Uri "$api/api/auth/login" -ContentType "application/json" -Body '{"code":"dev"}'
$headers = @{ Authorization = "Bearer $($login.token)" }
Invoke-RestMethod -Method Get -Uri "$api/api/study/courses" -Headers $headers |
  ConvertTo-Json -Depth 6
```

### 5.2 课程详情的 units/cards/questions 数量对得上

```powershell
Invoke-RestMethod -Method Get -Uri "$api/api/study/courses/<courseKey>" -Headers $headers |
  ConvertTo-Json -Depth 8
```

## 6. 常见问题（只保留高频、可直接动作的）

### 6.1 403 Forbidden

根因：token 不是 STAFF（JWT payload 里缺 role 或 role != STAFF）。

动作：
- 本地：按“3.1”提升并重新登录
- 线上：用真实 STAFF 账号重新获取 token

### 6.2 Unit not defined / 文件名不匹配

根因：`cards/*.tsv` 或 `questions/*.gift` 的文件名必须等于 `units.json` 的 `unitKey`，大小写完全一致。

动作：
- 改文件名或改 units.json 的 unitKey，使其一致

### 6.3 说有 N 门课但只导入了 M 门

根因：课程包以 `manifest.json` 为准。只找到 M 份 manifest.json 就只有 M 门。

动作：
- 让提供方补齐缺失课程包目录（包含 manifest.json、units.json）

## 7. 最小化 token 消耗的工作原则（强制）

- 永远先扫 `manifest.json` 决定导入清单；不要靠肉眼翻目录。
- 永远先跑 `--dry-run`；失败就停在失败点，不做“猜测性探索”。
- 所有入口只记三个固定路径：
  - `待导入课程/**/manifest.json`
  - `bookworm-backend/scripts/import_course_client.js`
  - `bookworm-backend/upgrade-user-to-staff.ts`

