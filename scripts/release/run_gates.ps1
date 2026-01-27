param(
  [string]$RepoRoot = (Resolve-Path ".").Path,
  [string]$BackendDir = "bookworm-backend",
  [string]$PgImage = "postgres:15",
  [string]$PgContainer = "bookworm_postgres_deploy_test",
  [int]$PgPort = 65433,
  [string]$PgDb = "bookworm_deploy_test",
  [string]$PgUser = "postgres",
  [string]$PgPassword = "password",
  [int]$PgReadyTimeoutSec = 60
)

$ErrorActionPreference = "Stop"

$logPath = Join-Path $RepoRoot "docs/audits/gate_run_20260127.log"
$summaryPath = Join-Path $RepoRoot "docs/audits/gate_run_20260127_summary.txt"
if (Test-Path $logPath) { Remove-Item $logPath -Force }
if (Test-Path $summaryPath) { Remove-Item $summaryPath -Force }

$backendPath = Join-Path $RepoRoot $BackendDir
$summary = New-Object System.Collections.Generic.List[string]

function Write-LogLine([string]$line) {
  $line | Out-File -FilePath $logPath -Append -Encoding utf8
}

function Invoke-Step([string]$label, [string]$command, [string]$workdir) {
  Write-Host "== $label =="
  Write-LogLine "== $label =="
  Push-Location $workdir
  $stepStart = Get-Date
  $prevErrorAction = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = & cmd /c $command 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $prevErrorAction
  $duration = (Get-Date) - $stepStart
  if ($output) { $output | Out-File -FilePath $logPath -Append -Encoding utf8 }
  Pop-Location
  if ($exitCode -ne 0) { throw "$label failed with exit code $exitCode" }
  $summary.Add(("{0}: PASS ({1:n1}s)" -f $label, $duration.TotalSeconds))
}

function Ensure-Container {
  $existing = docker ps -a --filter ("name=^/{0}$" -f $PgContainer) --format "{{.ID}}"
  if ($existing) { docker rm -f $PgContainer | Out-Null }
  Write-Host "== Start empty postgres =="
  Write-LogLine "== Start empty postgres =="
  $prevErrorAction = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $image = if ([string]::IsNullOrWhiteSpace($PgImage)) { "postgres:15" } else { $PgImage }
  $dockerCommand = "docker run --rm -d --name $PgContainer -e POSTGRES_PASSWORD=$PgPassword -e POSTGRES_USER=$PgUser -e POSTGRES_DB=$PgDb -p $($PgPort):5432 $image"
  Write-LogLine "DockerCommand: $dockerCommand"
  $output = & cmd /c $dockerCommand 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $prevErrorAction
  if ($output) { $output | Out-File -FilePath $logPath -Append -Encoding utf8 }
  if ($exitCode -ne 0) { throw "Failed to start postgres container" }

  $ready = $false
  $waited = 0
  while ($waited -lt $PgReadyTimeoutSec) {
    $prevErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $check = & docker exec $PgContainer pg_isready -U $PgUser -d $PgDb 2>&1
    $ErrorActionPreference = $prevErrorAction
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 2
    $waited += 2
  }
  if (-not $ready) { throw "Postgres did not become ready in $PgReadyTimeoutSec seconds" }
  $summary.Add("Empty DB container: READY (port $PgPort)")
}

function Cleanup-Container {
  $running = docker ps --filter ("name=^/{0}$" -f $PgContainer) --format "{{.ID}}"
  if ($running) {
    & docker stop $PgContainer | Out-Null
  }
}

$start = Get-Date
try {
  Invoke-Step "Gate-1 lint" "npm run lint" $backendPath
  Invoke-Step "Gate-2 build" "npm run build" $backendPath
  Invoke-Step "Gate-3 unit tests" "npm test" $backendPath
  Invoke-Step "Gate-4 integration (standard test DB)" "npm run test:integration" $backendPath

  Ensure-Container

  $env:DATABASE_URL = "postgresql://$PgUser`:$PgPassword@localhost:$PgPort/$PgDb?schema=public"
  Invoke-Step "Gate-5 migrate deploy" "npx prisma migrate deploy" $backendPath
  Invoke-Step "Gate-5 migrate status" "npx prisma migrate status" $backendPath
  Invoke-Step "Gate-5 integration (empty DB + deploy)" "npm run test:integration" $backendPath
}
finally {
  try { Cleanup-Container } catch { }
  if (Test-Path Env:DATABASE_URL) { Remove-Item Env:DATABASE_URL }
  $elapsed = (Get-Date) - $start
  $summary.Add(("Total duration: {0:n1}s" -f $elapsed.TotalSeconds))
  $summary | Out-File -FilePath $summaryPath -Encoding utf8
  "== SUMMARY ==" | Out-File -FilePath $logPath -Append -Encoding utf8
  $summary | Out-File -FilePath $logPath -Append -Encoding utf8
  Write-Host "== SUMMARY =="
  $summary | ForEach-Object { Write-Host $_ }
  Write-Host "Log: $logPath"
  Write-Host "Summary: $summaryPath"
}
