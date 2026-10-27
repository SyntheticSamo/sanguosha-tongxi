$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$tongxiNode = Get-Command node -ErrorAction SilentlyContinue
if ($tongxiNode) { & $tongxiNode.Source 'scripts/serve.mjs' }
else { Write-Host 'Please install Node.js 22+ and run: node scripts/serve.mjs'; exit 1 }
