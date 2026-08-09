#requires -Version 5.1
<#
.SYNOPSIS
  Build demo chart envelope and open the HTML viewer (with injected data).
#>
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$tool = Join-Path $root "src\chart_tool.py"
$viewer = Join-Path $root "renderers\echarts_viewer.html"
$example = Join-Path $PSScriptRoot "quarterly_revenue.json"
$outDir = Join-Path $root "..\..\runs\inline-chart"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$envelopePath = Join-Path $outDir "demo_envelope.json"
$py = @(
    "py",
    "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
    "python"
) | Where-Object {
    if ($_ -eq "py" -or $_ -eq "python") { Get-Command $_ -ErrorAction SilentlyContinue }
    else { Test-Path $_ }
} | Select-Object -First 1
if (-not $py) { throw "Python not found" }
if ($py -eq "py") { & py -3 $tool --input $example --ascii -o $envelopePath }
else { & $py $tool --input $example --ascii -o $envelopePath }
if ($LASTEXITCODE -ne 0) { throw "chart_tool.py failed" }

$envelope = Get-Content $envelopePath -Raw
# Inject into a temp HTML so we don't need a server
$html = Get-Content $viewer -Raw
$inject = "<script>window.CHART_ENVELOPE = $envelope;</script>"
$html = $html -replace "</head>", "$inject`n</head>"
$demoHtml = Join-Path $outDir "demo_viewer.html"
Set-Content -Path $demoHtml -Value $html -Encoding UTF8
Write-Host "Envelope: $envelopePath"
Write-Host "Viewer:   $demoHtml"
Start-Process $demoHtml
