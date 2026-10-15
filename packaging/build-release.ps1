[CmdletBinding()]
param(
    [string]$PayloadRoot,
    [string]$Output,
    [ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$')][string]$Version = '1.1.0'
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
if ($xml.ExtensionManifest.ExtensionBundleVersion -ne $Version -or $xml.ExtensionManifest.ExtensionList.Extension.Version -ne $Version) { throw 'CEP manifest and release version must match.' }
$packageMetadata = Get-Content -LiteralPath (Join-Path $payload 'package.json') -Raw | ConvertFrom-Json
$catalogMetadata = Get-Content -LiteralPath (Join-Path $payload 'library\catalog.json') -Raw | ConvertFrom-Json
if ($packageMetadata.name -ne 'contentrium-preset' -or $packageMetadata.version -ne $Version) { throw 'package.json product and release version must match.' }
if ($catalogMetadata.product -ne 'Contentrium Preset' -or $catalogMetadata.version -ne $Version) { throw 'Catalog product and release version must match.' }
& (Join-Path $project 'installer\build.ps1') -Output (Join-Path $outputPath 'Setup.exe')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stage = Join-Path ([IO.Path]::GetTempPath()) ('ContentriumPreset-Package-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($stage) | Out-Null
try {
    $extension = Join-Path $stage 'com.contentrium.preset'
    [IO.Directory]::CreateDirectory($extension) | Out-Null
    foreach ($name in @('index.html','panel.css','panel.js')) {
        $source = Join-Path $payload $name
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Required public file missing: $name" }
        Copy-Item -LiteralPath $source -Destination $extension
    }
    if (Test-Path -LiteralPath (Join-Path $payload 'preview.js')) { Copy-Item -LiteralPath (Join-Path $payload 'preview.js') -Destination $extension }
    foreach ($name in @('CSXS','jsx','library','assets')) {
        $source = Join-Path $payload $name
        if (Test-Path -LiteralPath $source -PathType Container) {
            $links = Get-ChildItem -LiteralPath $source -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }
            if ($links) { throw "Reparse points are not allowed in package: $name" }
            Copy-Item -LiteralPath $source -Destination $extension -Recurse
        }
    }
    foreach ($required in @('jsx','library')) { if (-not (Test-Path -LiteralPath (Join-Path $extension $required))) { throw "Required public folder missing: $required" } }
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
