[CmdletBinding()]
param(
    [string]$PayloadRoot,
    [string]$Output,
    [ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$')][string]$Version = '1.2.0',
    [switch]$ValidateOnly
)
$ErrorActionPreference = 'Stop'
if (-not $PayloadRoot) { $PayloadRoot = Split-Path -Parent $PSScriptRoot }
if (-not $Output) { $Output = Join-Path $PSScriptRoot 'out' }
$project = Split-Path -Parent $PSScriptRoot
$payload = [IO.Path]::GetFullPath($PayloadRoot)
$outputPath = [IO.Path]::GetFullPath($Output)
$manifest = Join-Path $payload 'CSXS\manifest.xml'
if (-not (Test-Path -LiteralPath $manifest)) { throw "Public CEP payload is not ready: $manifest" }
[xml]$xml = Get-Content -LiteralPath $manifest -Raw
if ($xml.ExtensionManifest.ExtensionBundleId -ne 'com.contentrium.preset') { throw 'Public extension ID must be com.contentrium.preset.' }
if ($xml.ExtensionManifest.ExtensionBundleVersion -ne $Version) { throw 'CEP manifest and release version must match.' }
$packageMetadata = Get-Content -LiteralPath (Join-Path $payload 'package.json') -Raw | ConvertFrom-Json
$catalogMetadata = Get-Content -LiteralPath (Join-Path $payload 'library\catalog.json') -Raw | ConvertFrom-Json
if ($packageMetadata.name -ne 'contentrium-preset' -or $packageMetadata.version -ne $Version) { throw 'package.json product and release version must match.' }
if ($catalogMetadata.product -ne 'Contentrium Preset' -or $catalogMetadata.version -ne $Version) { throw 'Catalog product and release version must match.' }
$contractSource = [IO.File]::ReadAllText((Join-Path $project 'installer\Setup.cs'))
function Contract-Values([string]$Name) {
    $match = [regex]::Match($contractSource, ('const string ' + $Name + ' = "([^"]+)";'))
    if (-not $match.Success) { throw "Installer payload contract missing: $Name" }
    return $match.Groups[1].Value.Split('|')
}
$requiredFiles = @(Contract-Values 'RequiredPayloadPaths')
$panelViews = @(Contract-Values 'RequiredPanelViews')
function Assert-Payload([string]$Root) {
    foreach ($name in $requiredFiles) { if (-not (Test-Path -LiteralPath (Join-Path $Root $name) -PathType Leaf)) { throw "Required public file missing: $name" } }
    [xml]$manifestXml = Get-Content -LiteralPath (Join-Path $Root 'CSXS\manifest.xml') -Raw
    $bundle = $manifestXml.ExtensionManifest
    if (-not $bundle -or $bundle.ExtensionBundleId -cne 'com.contentrium.preset' -or $bundle.ExtensionBundleVersion -cne $Version) { throw 'CEP manifest and release version must match.' }
    $entries = @($bundle.ExtensionList.Extension)
    $dispatches = @($bundle.DispatchInfoList.Extension)
    if (@($bundle.ExtensionList).Count -ne 1 -or @($bundle.DispatchInfoList).Count -ne 1 -or $entries.Count -ne $panelViews.Count -or $dispatches.Count -ne $panelViews.Count) { throw 'CEP panel list must contain the exact nine panels.' }
    foreach ($view in $panelViews) {
        $id = 'com.contentrium.preset'; $main = './index.html'
        if ($view -ne 'browse') { $id += '.' + $view; $main += '?view=' + $view }
        $entry = @($entries | Where-Object { $_.Id -ceq $id })
        $route = @($dispatches | Where-Object { $_.Id -ceq $id })
        if ($entry.Count -ne 1 -or $entry[0].Version -cne $Version -or $route.Count -ne 1) { throw "CEP panel version or identity mismatch: $id" }
        $resources = $route[0].DispatchInfo.Resources
        if (-not $resources -or @($route[0].DispatchInfo).Count -ne 1 -or @($resources).Count -ne 1 -or @($resources.MainPath).Count -ne 1 -or @($resources.ScriptPath).Count -ne 1 -or $resources.MainPath -cne $main -or $resources.ScriptPath -cne './jsx/engine.jsx') { throw "CEP panel dispatch mismatch: $id" }
    }
    $catalog = Get-Content -LiteralPath (Join-Path $Root 'library\catalog.json') -Raw | ConvertFrom-Json
    if ($catalog.product -cne 'Contentrium Preset' -or $catalog.version -cne $Version) { throw 'Catalog product and release version must match.' }
}
Assert-Payload $payload
if ($ValidateOnly) { [pscustomobject]@{valid=$true;version=$Version;requiredFiles=$requiredFiles.Count;panels=$panelViews.Count}; return }
& (Join-Path $project 'installer\build.ps1') -Output (Join-Path $outputPath 'Setup.exe')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stage = Join-Path ([IO.Path]::GetTempPath()) ('ContentriumPreset-Package-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($stage) | Out-Null
try {
    $extension = Join-Path $stage 'com.contentrium.preset'
    [IO.Directory]::CreateDirectory($extension) | Out-Null
    foreach ($name in @('index.html','panel.css','panel.js','ui-core.js','ui-animated-font.js','ui-property-sets.js','ui-editor.js','ui-media.js','ui-sync.js','ui-workspace.js','ui-library.js','ui-thumbnails.js','ui-thumbnail-worker.js','ui-file-lease.js','ui-theme.js','ui-audio.js','ui-audio-export.js','preview.js','preview-audio-source.js','preview-audio-preparer.js')) {
        $source = Join-Path $payload $name
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Required public file missing: $name" }
        Copy-Item -LiteralPath $source -Destination $extension
    }
    foreach ($name in @('CSXS','jsx','library','assets','thumbnail-worker')) {
        $source = Join-Path $payload $name
        if (Test-Path -LiteralPath $source -PathType Container) {
            $links = Get-ChildItem -LiteralPath $source -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }
            if ($links) { throw "Reparse points are not allowed in package: $name" }
            Copy-Item -LiteralPath $source -Destination $extension -Recurse
        }
    }
    foreach ($required in @('jsx','library')) { if (-not (Test-Path -LiteralPath (Join-Path $extension $required))) { throw "Required public folder missing: $required" } }
    Assert-Payload $extension
    foreach ($name in @('install.ps1','Install.cmd','README.md')) { Copy-Item -LiteralPath (Join-Path $project $name) -Destination $stage }
    if (Test-Path -LiteralPath (Join-Path $project 'LICENSE') -PathType Leaf) { Copy-Item -LiteralPath (Join-Path $project 'LICENSE') -Destination $stage }
    [IO.Directory]::CreateDirectory((Join-Path $stage 'docs')) | Out-Null
    Copy-Item -LiteralPath (Join-Path $project 'docs\user-guide.md') -Destination (Join-Path $stage 'docs')
    foreach ($name in @('browse.png','verification.md')) {
        $document = Join-Path $project ('docs\' + $name)
        if (Test-Path -LiteralPath $document -PathType Leaf) { Copy-Item -LiteralPath $document -Destination (Join-Path $stage 'docs') }
    }
    Copy-Item -LiteralPath (Join-Path $outputPath 'Setup.exe') -Destination $stage
    $hashes = [ordered]@{}
    foreach ($file in Get-ChildItem -LiteralPath $stage -File -Recurse | Sort-Object FullName) {
        $relative = $file.FullName.Substring($stage.Length + 1).Replace('\','/')
        $hashes[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $info = [ordered]@{ schemaVersion=1; product='Contentrium Preset'; version=$Version; extensionId='com.contentrium.preset'; files=$hashes }
    [IO.File]::WriteAllText((Join-Path $stage 'package-info.json'), ($info | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
    $archive = Join-Path $outputPath 'Portable.zip'
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    [IO.Compression.ZipFile]::CreateFromDirectory($stage, $archive, [IO.Compression.CompressionLevel]::Optimal, $false)
    $release = [ordered]@{ schemaVersion=1; product='Contentrium Preset'; version=$Version; asset='Portable.zip'; sha256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant(); size=(Get-Item -LiteralPath $archive).Length; extensionId='com.contentrium.preset' }
    [IO.File]::WriteAllText((Join-Path $outputPath 'release-manifest.json'), ($release | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    $release | ConvertTo-Json
} finally {
    $resolvedStage = [IO.Path]::GetFullPath($stage)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if ($resolvedStage.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedStage).StartsWith('ContentriumPreset-Package-')) { Remove-Item -LiteralPath $resolvedStage -Recurse -Force }
}
