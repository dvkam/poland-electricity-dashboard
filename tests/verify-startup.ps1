$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$launcher = Join-Path $project 'start-local.ps1'
$shellPath = (Get-Process -Id $PID).Path
$logs = Join-Path $project '.local-run'
$beforeApi = Get-Content (Join-Path $logs 'api.pid') -Raw
$beforeVite = Get-Content (Join-Path $logs 'vite.pid') -Raw
& $shellPath -NoProfile -File $launcher
if ($LASTEXITCODE -ne 0) { throw 'Managed startup failed' }
if ((Get-Content (Join-Path $logs 'api.pid') -Raw) -ne $beforeApi -or
    (Get-Content (Join-Path $logs 'vite.pid') -Raw) -ne $beforeVite) { throw 'Startup duplicated a running process' }
Write-Output 'PASS managed startup reuses both processes'
foreach ($name in @('api.pid', 'vite.pid')) {
  $path = Join-Path $logs $name
  $original = Get-Content -LiteralPath $path -Raw
  try {
    Set-Content -LiteralPath $path '0'
    $output = & $shellPath -NoProfile -File $launcher 2>&1
    if ($LASTEXITCODE -eq 0 -or ($output -join ' ') -notmatch 'unmanaged') {
      throw "Unowned service was not rejected: $name"
    }
    Write-Output "PASS refuses unowned service: $name"
  } finally {
    [IO.File]::WriteAllText($path, $original)
  }
}
