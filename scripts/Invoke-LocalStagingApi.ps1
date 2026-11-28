[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][ValidateSet('operator','schoolAdminA','schoolAdminB','teacherA','teacherB','learnerA','learnerB','dan')][string]$Role,
 [ValidateSet('GET','POST')][string]$Method='GET',
 [ValidateSet('/api/institutional','/api/mock-exams','/api/ai-quiz')][string]$Path='/api/institutional',
 [ValidateSet('A','B')][string]$School='A',
 [string]$Body
)
$ErrorActionPreference='Stop'
$Repo=Split-Path $PSScriptRoot -Parent
$Settings=Get-Content (Join-Path $Repo '.local-staging/environment.json') -Raw | ConvertFrom-Json
if ($Settings.NEXT_PUBLIC_SUPABASE_URL -ne 'http://127.0.0.1:55421' -or $Settings.NEXT_PUBLIC_SITE_URL -ne 'http://127.0.0.1:4323') { throw 'Refusing non-local settings.' }
$Fixtures=Get-Content (Join-Path $Repo '.local-staging/accounts.json') -Raw | ConvertFrom-Json
$Account=$Fixtures.accounts.$Role
$Login=Invoke-RestMethod -Method POST -Uri 'http://127.0.0.1:55421/auth/v1/token?grant_type=password' -Headers @{apikey=$Settings.NEXT_PUBLIC_SUPABASE_ANON_KEY} -ContentType 'application/json' -Body (@{email=$Account.email;password=$Account.password}|ConvertTo-Json)
$Headers=@{Authorization="Bearer $($Login.access_token)";'X-Institution-Id'=$Fixtures.schools.$School.institution_id}
$Args=@{Method=$Method;Uri="http://127.0.0.1:4323$Path";Headers=$Headers}
if ($Method -eq 'POST') {
 if (-not $Body) { throw 'POST requires -Body JSON.' }
 $null=$Body|ConvertFrom-Json
 $Args.ContentType='application/json';$Args.Body=$Body
}
# HTTP errors remain visible (expected for denied-access acceptance checks).
Invoke-RestMethod @Args | ConvertTo-Json -Depth 30
