[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$taskRoot = Join-Path ([IO.Path]::GetTempPath()) ('ContentriumPreset-PackageValidation-' + [guid]::NewGuid().ToString('N'))
$payload = Join-Path $taskRoot 'payload'
$output = Join-Path $taskRoot 'output'
[IO.Directory]::CreateDirectory((Join-Path $payload 'CSXS')) | Out-Null
[IO.Directory]::CreateDirectory((Join-Path $payload 'library')) | Out-Null
$results = [Collections.Generic.List[object]]::new()
function Write-Fixture([string]$PackageVersion, [string]$CatalogVersion, [string]$CatalogProduct = 'Contentrium Preset', [string]$CepVersion = '1.2.0') {
    $xml = '<ExtensionManifest ExtensionBundleId="com.contentrium.preset" ExtensionBundleVersion="VERSION"><ExtensionList><Extension Id="com.contentrium.preset" Version="VERSION"/></ExtensionList></ExtensionManifest>'
    [IO.File]::WriteAllText((Join-Path $payload 'CSXS\manifest.xml'), $xml.Replace('VERSION',$CepVersion))
    [IO.File]::WriteAllText((Join-Path $payload 'package.json'), (@{name='contentrium-preset';version=$PackageVersion} | ConvertTo-Json))
    [IO.File]::WriteAllText((Join-Path $payload 'library\catalog.json'), (@{product=$CatalogProduct;version=$CatalogVersion} | ConvertTo-Json))
}
function Assert-Rejected([string]$Name, [string]$ExpectedMessage) {
    $failure = $null
    try { & (Join-Path $PSScriptRoot 'build-release.ps1') -PayloadRoot $payload -Output $output | Out-Null } catch { $failure = $_.Exception.Message }
    if (-not $failure -or $failure.IndexOf($ExpectedMessage,[StringComparison]::OrdinalIgnoreCase) -lt 0) { throw "Unexpected packaging result for ${Name}: $failure" }
    if (Test-Path -LiteralPath $output) { throw "Packaging produced output before rejecting $Name" }
    $results.Add(@{test=$Name;pass=$true})
}
try {
    Write-Fixture '1.0.0' '1.2.0'
    Assert-Rejected 'package version mismatch before compile' 'package.json product and release version'
    Write-Fixture '1.2.0' '1.0.0'
    Assert-Rejected 'catalog version mismatch before compile' 'Catalog product and release version'
    Write-Fixture '1.2.0' '1.2.0' 'Other Product'
    Assert-Rejected 'catalog product mismatch before compile' 'Catalog product and release version'
    Write-Fixture '1.2.0' '1.2.0' 'Contentrium Preset' '1.0.0'
    Assert-Rejected 'CEP version mismatch before compile' 'CEP manifest and release version'
    [pscustomobject]@{tests=$results.Count;passed=$results.Count;results=$results;installerBuilt=$false;installed=$false;published=$false} | ConvertTo-Json -Depth 5
} finally {
    $resolved = [IO.Path]::GetFullPath($taskRoot)
    $allowed = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or -not (Split-Path -Leaf $resolved).StartsWith('ContentriumPreset-PackageValidation-')) { throw 'Unsafe package-validation cleanup target.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
