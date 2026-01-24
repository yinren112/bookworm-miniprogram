# Run integration tests in Windows PowerShell environment
# This ensures Testcontainers can properly connect to Docker Desktop

Write-Host "==================== Running Integration Tests ====================" -ForegroundColor Cyan
Write-Host "Environment: Windows PowerShell" -ForegroundColor Yellow
Write-Host "Docker Context: $(docker context show)" -ForegroundColor Yellow
Write-Host ""

# Navigate to bookworm-backend directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Ensure postgres_test container is running
Write-Host "Ensuring postgres_test container is running..." -ForegroundColor Cyan
docker compose --profile test up -d postgres_test | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Error "Failed to start postgres_test container. Please check Docker Desktop." 
  exit 1
}
Write-Host "postgres_test container is ready." -ForegroundColor Green

# Run integration tests
Write-Host "Starting integration tests..." -ForegroundColor Cyan
npm run test:integration

Write-Host "`n==================== Test Complete ====================" -ForegroundColor Cyan
Write-Host "`nPress any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
