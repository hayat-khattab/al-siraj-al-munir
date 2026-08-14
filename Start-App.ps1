$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot
$tmp = Join-Path $env:TEMP 'opencode'
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

function Is-Listening([int]$port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Is-Listening 4000)) {
  Start-Process -FilePath 'npx.cmd' -ArgumentList 'tsx','watch','src/server.ts' `
    -WorkingDirectory (Join-Path $root 'server') `
    -RedirectStandardOutput (Join-Path $tmp 'seraj-server.log') `
    -RedirectStandardError (Join-Path $tmp 'seraj-server.err.log') `
    -WindowStyle Hidden | Out-Null
}

if (-not (Is-Listening 5173)) {
  Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' `
    -WorkingDirectory (Join-Path $root 'web') `
    -RedirectStandardOutput (Join-Path $tmp 'seraj-web.log') `
    -RedirectStandardError (Join-Path $tmp 'seraj-web.err.log') `
    -WindowStyle Hidden | Out-Null
}

for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 2000
  if (Is-Listening 5173) { break }
}

Start-Process 'http://localhost:5173'
