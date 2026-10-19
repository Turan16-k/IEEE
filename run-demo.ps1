# EmisPass end-to-end demo on a local Hardhat chain (Windows PowerShell).
# Prerequisite: `npx hardhat node` running in another terminal.
# Usage: .\run-demo.ps1 [-Network localhost|sepolia|baseSepolia] [-Serve]
param(
  [string]$Network = "localhost",
  [switch]$Serve
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$py = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }
$env:PYTHONPATH = Join-Path $PSScriptRoot "verifier"
$env:PYTHONIOENCODING = "utf-8"

Write-Host "`n[1/4] Synthetic demo dataset" -ForegroundColor Cyan
& $py -m emispass simulate
if ($LASTEXITCODE) { exit 1 }

Write-Host "`n[2/4] Deploy contracts ($Network)" -ForegroundColor Cyan
npx hardhat run scripts/deploy.js --network $Network
if ($LASTEXITCODE) { exit 1 }

Write-Host "`n[3/4] Operator signing + 3 AI verifier nodes" -ForegroundColor Cyan
& $py -m emispass run --deployment "deployments/$Network.json"
if ($LASTEXITCODE) { exit 1 }

Write-Host "`n[4/4] Anchor passports, attack suite, importer declarations" -ForegroundColor Cyan
npx hardhat run scripts/anchor.js --network $Network
if ($LASTEXITCODE) { exit 1 }

if ($Serve) {
  Write-Host "`nDashboard: http://localhost:8080/app/?network=$Network" -ForegroundColor Green
  & $py -m http.server 8080
}
