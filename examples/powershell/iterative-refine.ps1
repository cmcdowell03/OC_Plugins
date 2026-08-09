#requires -Version 5.1
<#
.SYNOPSIS
  Iterative refinement loop around `opencode run` (Windows-native).

.EXAMPLE
  .\iterative-refine.ps1 -MaxIter 5

.EXAMPLE
  .\iterative-refine.ps1 -Attach http://localhost:4096 -Agent code-improver -MaxIter 10
#>
[CmdletBinding()]
param(
    [int]$MaxIter = 10,
    [string]$SessionId = "",
    [string]$Model = "",
    [string]$Attach = "",
    [string]$Agent = "",
    [int]$SleepSeconds = 2,
    [string]$PromptFirst = "Improve the module based on previous feedback. Focus on performance and tests. When fully done, end with TASK_COMPLETE: <summary>.",
    [string]$PromptNext = "Continue improving based on the last changes and test results. When fully done, end with TASK_COMPLETE: <summary>."
)

$ErrorActionPreference = "Stop"

function Invoke-OpenCodeRun {
    param(
        [string]$Prompt,
        [string]$Session,
        [switch]$Continue
    )

    $args = @("run", "--format", "json")
    if ($Model)  { $args += @("--model", $Model) }
    if ($Attach) { $args += @("--attach", $Attach) }
    if ($Agent)  { $args += @("--agent", $Agent) }
    if ($Session) {
        if ($Continue) {
            $args += @("--continue", "--session", $Session)
        }
        else {
            $args += @("--session", $Session)
        }
    }
    $args += $Prompt

    Write-Verbose ("opencode " + ($args -join " "))
    $output = & opencode @args 2>&1 | Out-String
    return $output
}

function Get-SessionIdFromResponse {
    param([string]$Text)
    # Flexible match for session_id / sessionID / session
    if ($Text -match '"session(?:_id|ID)?"\s*:\s*"([^"]+)"') {
        return $Matches[1]
    }
    return $null
}

for ($iter = 0; $iter -lt $MaxIter; $iter++) {
    Write-Host "=== Iteration $iter ===" -ForegroundColor Cyan

    if ([string]::IsNullOrEmpty($SessionId)) {
        $response = Invoke-OpenCodeRun -Prompt $PromptFirst
    }
    else {
        $response = Invoke-OpenCodeRun -Prompt $PromptNext -Session $SessionId -Continue
    }

    $newId = Get-SessionIdFromResponse -Text $response
    if ($newId) { $SessionId = $newId }

    if ($response.Length -gt 2000) {
        Write-Host $response.Substring($response.Length - 2000)
    }
    else {
        Write-Host $response
    }

    if ($response -match "TASK_COMPLETE") {
        Write-Host "Loop finished successfully (TASK_COMPLETE)." -ForegroundColor Green
        exit 0
    }

    Start-Sleep -Seconds $SleepSeconds
}

Write-Host "Hit MaxIter=$MaxIter without TASK_COMPLETE." -ForegroundColor Yellow
exit 1
