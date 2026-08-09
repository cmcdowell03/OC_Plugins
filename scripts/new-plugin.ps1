#requires -Version 5.1
<#
.SYNOPSIS
  Scaffold a new OpenCode plugin from plugins/_template.

.EXAMPLE
  .\new-plugin.ps1 -Name my-plugin
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Name
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$template = Join-Path $root "plugins\_template"
$dest = Join-Path $root "plugins\$Name"

if (-not (Test-Path $template)) {
    throw "Template not found: $template"
}
if (Test-Path $dest) {
    throw "Plugin already exists: $dest"
}

Copy-Item -Path $template -Destination $dest -Recurse
$pluginJson = Join-Path $dest "plugin.json"
$readme = Join-Path $dest "README.md"
$prompt = Join-Path $dest "prompts\system.md"

foreach ($file in @($pluginJson, $readme, $prompt)) {
    if (Test-Path $file) {
        $text = Get-Content $file -Raw
        $text = $text -replace "my-plugin-agent", "$Name-agent"
        $text = $text -replace "my-plugin", $Name
        Set-Content -Path $file -Value $text -Encoding UTF8 -NoNewline
    }
}

# Optional agent brief in /agents
$agentBrief = Join-Path $root "agents\$Name.md"
@"
# Agent: $Name

- **Plugin:** ``plugins/$Name/``
- **Mode:** primary
- **Prompt:** ``plugins/$Name/prompts/system.md``

## Invoke

``````text
opencode run --agent $Name-agent --format json "<task>"
``````
"@ | Set-Content -Path $agentBrief -Encoding UTF8

Write-Host "Created plugin: $dest" -ForegroundColor Green
Write-Host "Agent brief:    $agentBrief"
Write-Host ""
Write-Host "Next:"
Write-Host "  1. Edit plugins\$Name\plugin.json"
Write-Host "  2. Edit plugins\$Name\prompts\system.md"
Write-Host "  3. Smoke-test: opencode run --format json `"...`""
