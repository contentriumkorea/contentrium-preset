# Test fixtures only. Does not compile, launch, or install anything.
function New-CompletePayloadFixture([string]$Extension, [string]$Version, [string]$IndexValue) {
    $project = Split-Path -Parent $PSScriptRoot
    $source = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Setup.cs'))
    $required = [regex]::Match($source, 'const string RequiredPayloadPaths = "([^"]+)";').Groups[1].Value.Split('|')
    foreach ($relative in $required) {
        $file = Join-Path $Extension $relative
        [IO.Directory]::CreateDirectory((Split-Path -Parent $file)) | Out-Null
        [IO.File]::WriteAllText($file,'fixture')
    }
    [xml]$manifest = Get-Content -LiteralPath (Join-Path $project 'CSXS\manifest.xml') -Raw
    $manifest.ExtensionManifest.ExtensionBundleVersion = $Version
    foreach ($panel in $manifest.ExtensionManifest.ExtensionList.Extension) { $panel.Version = $Version }
    $manifest.Save((Join-Path $Extension 'CSXS\manifest.xml'))
    [IO.File]::WriteAllText((Join-Path $Extension 'index.html'),$IndexValue)
    [IO.File]::WriteAllText((Join-Path $Extension 'library\catalog.json'),(@{product='Contentrium Preset';version=$Version}|ConvertTo-Json))
}
