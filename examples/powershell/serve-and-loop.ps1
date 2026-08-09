#requires -Version 5.1
<#
.SYNOPSIS
  Start `opencode serve` (if needed) and run the iterative refine loop against it.

.EXAMPLE
  .\serve-and-loop.ps1 -Port 4096 -MaxIter 5
#>
[CmdletBinding()]
param(
    [int]$Port = 4096,
    [int]$MaxIter = 5,
    [string]$Agent = "",
    [string]$Model = "",
    [switch]$SkipServerStart
)

$ErrorActionPreference = "Stop"
$attach = "http://localhost:$Port"
$serverProc = $null

try {
    if (-not $SkipServerStart) {
        Write-Host "Starting opencode serve on port $Port ..." -ForegroundColor Cyan
        $serverProc = Start-Process -FilePath "opencode" -ArgumentList @("serve", "--port", "$Port") -PassThru -WindowStyle Minimized
        Start-Sleep -Seconds 2
    }

    $script = Join-Path $PSScriptRoot "iterative-refine.ps1"
    $params = @{
        MaxIter = $MaxIter
        Attach  = $attach
    }
    if ($Agent) { $params.Agent = $Agent }
    if ($Model) { $params.Model = $Model }

    & $script @params
    exit $LASTEXITCODE
}
finally {
    if ($serverProc -and -not $serverProc.HasExited) {
        Write-Host "Stopping opencode serve (PID $($serverProc.Id))..." -ForegroundColor DarkGray
        Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
    }
}
