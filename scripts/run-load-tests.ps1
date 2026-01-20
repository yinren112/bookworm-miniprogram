$ErrorActionPreference = "Stop"

$projectRoot = "C:\Users\wapadil\WeChatProjects\miniprogram-13"
$backendDir = Join-Path $projectRoot "bookworm-backend"
$k6Path = Join-Path $projectRoot "tools\k6\k6.exe"
$sellScript = Join-Path $projectRoot "tools\load-testing\load-test-v2.js"
$buyScript = Join-Path $projectRoot "tools\load-testing\load-test.js"
$sellLog = Join-Path $projectRoot "k6-sell.log"
$buyLog = Join-Path $projectRoot "k6-buy.log"
$serverOut = Join-Path $projectRoot "server-out.log"
$serverErr = Join-Path $projectRoot "server-err.log"

Remove-Item -Path $sellLog, $buyLog, $serverOut, $serverErr -ErrorAction SilentlyContinue

# Linus式安全：永远不要硬编码认证凭据
# SECURITY: Tokens must be generated dynamically before each test run
# WARNING: Never commit JWT tokens to version control!

Write-Host "📝 Generating fresh load test tokens..." -ForegroundColor Cyan
Push-Location $backendDir
try {
    npm run generate-tokens
    if ($LASTEXITCODE -ne 0) {
        throw "Token generation failed"
    }
} finally {
    Pop-Location
}

# Load tokens from .env.load-test
$envFilePath = Join-Path $projectRoot ".env.load-test"
if (-not (Test-Path $envFilePath)) {
    Write-Error ".env.load-test file not found. Token generation may have failed."
    exit 1
}

Write-Host "🔑 Loading tokens from .env.load-test..." -ForegroundColor Cyan
Get-Content $envFilePath | ForEach-Object {
    if ($_ -match "^([^#].*)=(.*)$") {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        Set-Item -Path "Env:$key" -Value $value
        Write-Host "  ✓ Loaded $key" -ForegroundColor Green
    }
}

$Env:PORT = "8080"
$Env:BASE_URL = "http://127.0.0.1:8080"
$Env:NODE_ENV = "development"
$Env:API_RATE_LIMIT_MAX = "1000"
$Env:API_RATE_LIMIT_WINDOW_MINUTES = "1"

$serverEntry = Join-Path $backendDir "dist\src\index.js"

Write-Host "🚀 Starting backend server on port 8080..." -ForegroundColor Cyan
$server = Start-Process -FilePath "C:\Program Files\nodejs\node.exe" `
  -ArgumentList $serverEntry `
  -WorkingDirectory $backendDir `
  -WindowStyle Hidden `
  -RedirectStandardOutput $serverOut `
  -RedirectStandardError $serverErr `
  -PassThru

try {
  $maxAttempts = 20
  $isAlive = $false
  for ($i = 0; $i -lt $maxAttempts; $i++) {
    Start-Sleep -Seconds 1
    if ($server.HasExited) {
      throw "Backend process exited prematurely. See $serverErr for details."
    }
    $tcp = Test-NetConnection -ComputerName 127.0.0.1 -Port 8080 -WarningAction SilentlyContinue
    if ($tcp.TcpTestSucceeded) {
      $isAlive = $true
      break
    }
  }

  if (-not $isAlive) {
    throw "Backend failed to start listening on port 8080 within timeout. Inspect $serverErr."
  }

  Write-Host "✅ Backend server is ready!" -ForegroundColor Green
  Write-Host ""

  Write-Host "📊 Running sell order load test..." -ForegroundColor Cyan
  & $k6Path run $sellScript | Tee-Object -FilePath $sellLog
  $sellExitCode = $LASTEXITCODE
  Write-Host ""

  Write-Host "📊 Running buy order load test..." -ForegroundColor Cyan
  & $k6Path run $buyScript | Tee-Object -FilePath $buyLog
  $buyExitCode = $LASTEXITCODE
  Write-Host ""
}
finally {
  Write-Host "🛑 Stopping backend server..." -ForegroundColor Cyan
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force
  }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor White
Write-Host "          LOAD TEST RESULTS" -ForegroundColor White
Write-Host "========================================" -ForegroundColor White
Write-Host ""

if ($sellExitCode -eq 0) {
  Write-Host "✅ Sell order test: PASSED" -ForegroundColor Green
} else {
  Write-Host "❌ Sell order test: FAILED (exit code: $sellExitCode)" -ForegroundColor Red
}

if ($buyExitCode -eq 0) {
  Write-Host "✅ Buy order test: PASSED" -ForegroundColor Green
} else {
  Write-Host "❌ Buy order test: FAILED (exit code: $buyExitCode)" -ForegroundColor Red
}

Write-Host ""
Write-Host "📝 Logs saved to:" -ForegroundColor Cyan
Write-Host "   Sell test: $sellLog" -ForegroundColor Gray
Write-Host "   Buy test: $buyLog" -ForegroundColor Gray
Write-Host "   Server stdout: $serverOut" -ForegroundColor Gray
Write-Host "   Server stderr: $serverErr" -ForegroundColor Gray
Write-Host ""

if (($sellExitCode -ne 0) -or ($buyExitCode -ne 0)) {
  Write-Host "❌ Load tests FAILED" -ForegroundColor Red
  exit 1
} else {
  Write-Host "✅ All load tests PASSED" -ForegroundColor Green
  exit 0
}
