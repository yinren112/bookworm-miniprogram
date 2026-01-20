$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
$logDir = Join-Path $repoRoot "reports"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logPath = Join-Path $logDir ("test-integration-" + $timestamp + ".log")

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Push-Location $repoRoot
try {
  "Running npm run test:integration" | Tee-Object -FilePath $logPath
  npm run test:integration 2>&1 | Tee-Object -FilePath $logPath -Append
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}

"" | Tee-Object -FilePath $logPath -Append
("ExitCode: " + $exitCode) | Tee-Object -FilePath $logPath -Append

Write-Host ("Log saved to: " + $logPath)
exit $exitCode
