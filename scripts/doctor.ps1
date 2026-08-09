#requires -Version 5.1
<#
.SYNOPSIS
  Quick environment check for OpenCode + this repo.
#>
$ErrorActionPreference = "Continue"

Write-Host "=== OC_Plugins doctor ===" -ForegroundColor Cyan

$oc = Get-Command opencode -ErrorAction SilentlyContinue
if ($oc) {
    Write-Host "opencode: $($oc.Source)" -ForegroundColor Green
    try {
        & opencode --help 2>&1 | Select-Object -First 15
    } catch {
        Write-Host "opencode --help failed: $_" -ForegroundColor Yellow
    }
}
else {
    Write-Host "opencode: NOT FOUND on PATH" -ForegroundColor Red
    Write-Host "  Install OpenCode and ensure it is on PATH."
}

foreach ($tool in @("git", "python", "jq")) {
    $c = Get-Command $tool -ErrorAction SilentlyContinue
    if ($c) { Write-Host "$tool: $($c.Source)" }
    else { Write-Host "$tool: missing (optional)" -ForegroundColor DarkYellow }
}

$root = Split-Path -Parent $PSScriptRoot
Write-Host ""
Write-Host "Repo root: $root"
@(
    "AGENTS.md",
    "plugins\_template\plugin.json",
    "examples\powershell\iterative-refine.ps1",
    "examples\python\loop_harness.py",
    "harness\opencode_client.py"
) | ForEach-Object {
    $p = Join-Path $root $_
    $ok = Test-Path $p
    "{0}: {1}" -f $_, $(if ($ok) { "OK" } else { "MISSING" })
}
