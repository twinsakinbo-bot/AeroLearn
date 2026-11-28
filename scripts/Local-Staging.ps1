[CmdletBinding()]
param([ValidateSet('Setup','Start','Stop','Check')][string]$Action = 'Setup')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Repo = Split-Path $PSScriptRoot -Parent
Set-Location $Repo
function Run-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed (exit $LASTEXITCODE)." }
}
$Branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $Branch -ne 'integration/p0-a-waec-staging') { throw 'Use integration/p0-a-waec-staging in a dedicated checkout.' }
$EnvFiles = @(Get-ChildItem -Force -File | Where-Object { $_.Name -match '^\.env($|\.)' -and $_.Name -ne '.env.example' })
if ($EnvFiles.Count -gt 0) { throw 'Use a fresh dedicated checkout without .env files. Do not copy production credentials.' }
if (Test-Path 'supabase/.temp/project-ref') { throw 'This checkout is linked to a hosted Supabase project. Use a fresh checkout.' }
$Node = (Get-Command node -ErrorAction Stop).Source
$Docker = (Get-Command docker -ErrorAction Stop).Source
$Cli = (Get-Command supabase -ErrorAction Stop).Source
$env:LOCAL_SUPABASE_EXE = $Cli
$NodeMajor = [int]((& $Node -p 'process.versions.node.split(".")[0]').Trim())
if ($NodeMajor -lt 22) { throw 'Node.js 22 or later is required.' }
$CliVersion = (& $Cli --version).Trim()
if ($LASTEXITCODE -ne 0 -or $CliVersion -notmatch '^3\.') { throw 'Install Supabase CLI 3.x (tested with 3.4.0).' }
Run-Checked $Docker @('info','--format','{{.ServerVersion}}')
$Runtime = Join-Path $Repo '.local-staging/runtime'
$ConfigPath = Join-Path $Runtime 'supabase/config.jsonc'
if ($Action -eq 'Setup') {
    $Npm = if ($env:OS -eq 'Windows_NT') { 'npm.cmd' } else { 'npm' }
    Run-Checked $Npm @('ci','--include=dev')
    Run-Checked $Node @('scripts/local-staging/runtime.mjs','init')
}
if (-not (Test-Path $ConfigPath)) { throw 'Run Setup first.' }
$Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
if ($Config.project_id -ne 'aerolearn-windows-staging' -or $Config.api.port -ne 55421 -or $Config.db.port -ne 55422) { throw 'Unexpected runtime configuration. Refusing to continue.' }
if (Test-Path (Join-Path $Runtime 'supabase/.temp/project-ref')) { throw 'Hosted links are prohibited.' }
if ($Action -eq 'Stop') {
    # No --no-backup: preserve synthetic accounts, attempts and results.
    Run-Checked $Cli @('--workdir',$Runtime,'stop')
    Write-Host 'Stopped local staging; synthetic data is preserved. Stop the app terminal with Ctrl+C too.'
    exit
}
if ($Action -in @('Setup','Start')) {
    Run-Checked $Cli @('--workdir',$Runtime,'start','-x','realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor')
}
Run-Checked $Node @('scripts/local-staging/runtime.mjs','check')
if ($Action -eq 'Setup') {
    Run-Checked $Node @('scripts/local-staging/runtime.mjs','seed')
    if ($env:OS -eq 'Windows_NT') {
        $Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        Run-Checked 'icacls.exe' @((Join-Path $Repo '.local-staging'),'/inheritance:r','/grant:r',"${Identity}:(OI)(CI)F",'/T','/Q')
    }
    Write-Host 'Setup complete. Accounts: .local-staging/accounts.json. Start: .\scripts\Local-Staging.ps1 -Action Start'
} elseif ($Action -eq 'Start') {
    Write-Host 'Local preview: http://127.0.0.1:4323/auth/login (Ctrl+C stops the app).'
    Run-Checked $Node @('scripts/local-staging/runtime.mjs','start')
}
