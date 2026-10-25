$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$taskRoot = Split-Path (Split-Path $project -Parent) -Parent
$bundledNode = 'C:\Users\David\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (!(Test-Path -LiteralPath $bundledNode)) { throw 'Bundled Node runtime not found. Use the standard npm run dev instructions in README.md.' }
$linuxProject = (wsl -d Ubuntu-24.04 --exec wslpath -a $project.Replace('\','/')).Trim()
$linuxTask = (wsl -d Ubuntu-24.04 --exec wslpath -a $taskRoot.Replace('\','/')).Trim()
$linuxToolchain = "$linuxTask/work/toolchain"
$logDir = Join-Path $taskRoot 'work'
function Test-Endpoint([string]$url) {
  try { return (Invoke-WebRequest -Uri $url -TimeoutSec 2).StatusCode -eq 200 } catch { return $false }
}
if (!(Test-Endpoint 'http://127.0.0.1:8080/api/health')) {
  $startScript = "export OPAMROOT='/var/tmp/codex-prad-polski-build/opam-root'; cd '$linuxProject/backend'; exec '$linuxToolchain/opam' exec --switch=prad-polski -- dune exec bin/main.exe"
  Start-Process -FilePath 'wsl.exe' -ArgumentList @('-d','Ubuntu-24.04','--','bash','-lc',('"' + $startScript + '"')) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'api.log') -RedirectStandardError (Join-Path $logDir 'api-error.log') | Out-Null
}
if (!(Test-Endpoint 'http://127.0.0.1:5173')) {
  Start-Process -FilePath $bundledNode -ArgumentList @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173') -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'vite.log') -RedirectStandardError (Join-Path $logDir 'vite-error.log') | Out-Null
}
Write-Output 'Prąd Polski: http://127.0.0.1:5173 — the first source load can take several seconds.'
