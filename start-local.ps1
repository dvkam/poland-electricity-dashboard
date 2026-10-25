param([string]$Distribution = 'Ubuntu-24.04')
$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$node = if ($env:NODE_BIN) { $env:NODE_BIN } elseif (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node.exe -ErrorAction SilentlyContinue).Source }
if (!$node -or !(Test-Path -LiteralPath $node)) { throw 'Install Node 24+ or set NODE_BIN to its executable.' }
if ([int](& $node -p 'process.versions.node.split(".")[0]') -lt 24) { throw 'Node 24+ is required.' }
if (!(Test-Path "$project/node_modules/vite/bin/vite.js")) { throw 'Run npm ci in the project first.' }
if (!(Test-Path "$project/backend/_build/default/bin/main.exe")) { throw 'Build the OCaml backend in WSL first; see README.md.' }
$logDir = Join-Path $project '.local-run'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$linuxProject = (& wsl.exe -d $Distribution --exec wslpath -a $project.Replace('\','/')).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the project in WSL.' }
function Test-Api {
  try { return (Invoke-RestMethod 'http://127.0.0.1:8080/api/health' -TimeoutSec 2).service -eq 'prad-polski-ocaml' } catch { return $false }
}
function Test-Frontend {
  try { return (Invoke-WebRequest 'http://127.0.0.1:5173' -TimeoutSec 2).Content.Contains('/src/main.tsx') } catch { return $false }
}
function Test-OwnedProcess([string]$pidFile, [string]$expectedName, [string]$expectedPath) {
  if (!(Test-Path -LiteralPath $pidFile)) { return $false }
  $savedId = 0
  if (![int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$savedId)) { return $false }
  $running = Get-CimInstance Win32_Process -Filter "ProcessId = $savedId"
  return $running -and $running.Name -eq $expectedName -and $running.CommandLine -and $running.CommandLine.Contains($expectedPath)
}
$vitePath = Join-Path $project 'node_modules\vite\bin\vite.js'
if ((Test-Api) -and !(Test-OwnedProcess "$logDir/api.pid" 'wsl.exe' "$linuxProject/backend")) {
  throw 'Port 8080 is serving an unmanaged dashboard. Stop that instance before starting this project.'
}
if ((Test-Frontend) -and !(Test-OwnedProcess "$logDir/vite.pid" 'node.exe' $vitePath)) {
  throw 'Port 5173 is serving another or unmanaged frontend. Stop that instance before starting this project.'
}
if (!(Test-Api)) {
  $arguments = @('-d', $Distribution, '--cd', ('"' + $linuxProject + '/backend"'), '--exec', './_build/default/bin/main.exe')
  $process = Start-Process wsl.exe -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput "$logDir/api.log" -RedirectStandardError "$logDir/api-error.log"
  $process.Id | Set-Content "$logDir/api.pid"
}
if (!(Test-Frontend)) {
  $process = Start-Process $node -ArgumentList @(('"' + $vitePath + '"'),'--host','127.0.0.1','--port','5173','--strictPort') -WorkingDirectory $project -WindowStyle Hidden -PassThru -RedirectStandardOutput "$logDir/vite.log" -RedirectStandardError "$logDir/vite-error.log"
  $process.Id | Set-Content "$logDir/vite.pid"
}
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  if ((Test-Api) -and (Test-Frontend) -and
      (Test-OwnedProcess "$logDir/api.pid" 'wsl.exe' "$linuxProject/backend") -and
      (Test-OwnedProcess "$logDir/vite.pid" 'node.exe' $vitePath)) {
    Write-Output 'Prąd Polski: http://127.0.0.1:5173'; exit 0
  }
  Start-Sleep -Seconds 1
}
throw "Startup failed. Inspect logs in $logDir."

