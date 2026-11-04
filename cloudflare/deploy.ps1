# Deploys the optional automatic-pairing Worker to your own Cloudflare account and
# points the site at it. From the project folder, in PowerShell:
#
#   powershell -ExecutionPolicy Bypass -File cloudflare\deploy.ps1
#
# Safe to run again: it re-deploys the same Worker and rewrites the address.
# Kept ASCII-only so Windows PowerShell 5.1 parses it under any system code page.

$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot
$root = Split-Path -Parent $PSScriptRoot
# Windows PowerShell 5.1 on older .NET may not offer TLS 1.2 by default.
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

function Step($text) { Write-Host ''; Write-Host "== $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host $text -ForegroundColor Red; exit 1 }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js 22+ is required: https://nodejs.org' }
$npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
if (-not $npx) { $npx = Get-Command npx -ErrorAction SilentlyContinue }
if (-not $npx) { Fail 'npx was not found. Reinstall Node.js with npm included.' }
function Wrangler { & $npx.Source --yes wrangler@4 @args }

Step '1/5  Cloudflare sign-in'
$who = (Wrangler whoami | Out-String)
if ($who -match 'not authenticated' -or $LASTEXITCODE -ne 0) {
  Write-Host 'A browser window will open. Sign in (or create a free account) and click Allow.'
  Wrangler login
  if ($LASTEXITCODE -ne 0) { Fail 'Sign-in did not finish. Run this script again.' }
} else { Write-Host 'Already signed in.' }

Step '2/5  Deploy the Worker'
Write-Host 'If asked to register a workers.dev subdomain, pick any name; it becomes part of the address.'
Wrangler deploy
if ($LASTEXITCODE -ne 0) { Fail 'Deploy failed. Read the message above; running the script again is safe.' }

Step '3/5  Worker address'
$url = ''
while (-not $url) {
  $answer = (Read-Host 'Paste the https://....workers.dev address printed above').Trim().TrimEnd('/')
  if ($answer -match '^https://[A-Za-z0-9.-]+$') { $url = $answer } else { Write-Host 'That does not look like https://name.subdomain.workers.dev - try again.' }
}
$ok = $false
for ($i = 1; $i -le 12 -and -not $ok; $i++) {
  try { $r = Invoke-RestMethod -Uri "$url/v1/health" -TimeoutSec 10; if ($r.ok) { $ok = $true } }
  catch { Write-Host "  not reachable yet ($i/12), new addresses can take a minute..."; Start-Sleep -Seconds 5 }
}
if ($ok) { Write-Host "Worker is up: $url/v1/health" -ForegroundColor Green }
else { Write-Host 'Could not reach the health check yet. The config is still written; try the address in a browser later.' -ForegroundColor Yellow }

Step '4/5  Point the site at it'
$config = Join-Path $root 'dist\sync\relay-config.js'
$text = "// Address of your own deployed signaling Worker (see cloudflare/README.md).`r`n" +
        "// Set to '' to go back to the fully manual invitation flow. Players can also`r`n" +
        "// override it per device in the network settings of the connect dialog.`r`n" +
        "export const SIGNAL_URL='$url';`r`n"
[System.IO.File]::WriteAllText($config, $text, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Wrote $config"

Step '5/5  Optional: TURN relay for strict NATs (mobile data, some campus networks)'
$turn = Read-Host 'Set up Cloudflare TURN now? Free for the first 1,000 GB/month, then billed per GB. (y/N)'
if ($turn -match '^[yY]') {
  Write-Host 'Open https://dash.cloudflare.com/?to=/:account/calls , go to the TURN section and create a TURN key.'
  Write-Host 'It shows a key ID and an API token; keep that page open. Docs: https://developers.cloudflare.com/realtime/turn/generate-credentials/'
  Write-Host 'Paste the Key ID when asked, then the API token. Input is hidden and stored only as a Worker secret.'
  Wrangler secret put TURN_KEY_ID
  Wrangler secret put TURN_KEY_API_TOKEN
} else { Write-Host 'Skipped. You can run this script again later to add it.' }

Write-Host ''
Write-Host 'Done. Next:' -ForegroundColor Green
Write-Host '  1. Test locally: node scripts/serve.mjs, open http://localhost:4173 in two browser windows'
Write-Host '     (one normal, one private), create a table in one, open Connect, copy the room link into the other.'
Write-Host '  2. Publish: commit and merge to main; GitHub Pages then serves the new version to your friends.'
