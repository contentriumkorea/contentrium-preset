[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -eq 'Core') {
    & (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -NoProfile -File $PSCommandPath
    if ($LASTEXITCODE -ne 0) { throw 'Payload contract tests failed.' }
    return
}
$project = Split-Path -Parent $PSScriptRoot
$payloadVersion = (Get-Content -LiteralPath (Join-Path $project 'package.json') -Raw | ConvertFrom-Json).version
$source = [IO.File]::ReadAllText((Join-Path $project 'installer\Setup.cs'))
$contract = [regex]::Match($source, '(?s)// BEGIN PAYLOAD CONTRACT\s*(.*?)\s*// END PAYLOAD CONTRACT')
if (-not $contract.Success) { throw 'Shared installer payload contract is missing.' }
$required = [regex]::Match($contract.Groups[1].Value, 'const string RequiredPayloadPaths = "([^"]+)";').Groups[1].Value.Split('|')
$verifySource = [IO.File]::ReadAllText((Join-Path $project 'tools\verify-package.cjs'))
$verifyRequired = [regex]::Matches([regex]::Match($verifySource, 'const required=(\[[^\r\n]+\]);').Groups[1].Value, "'([^']+)'") | ForEach-Object { $_.Groups[1].Value }
if (@(Compare-Object $required $verifyRequired).Count) { throw 'Installer and existing package verifier required-file lists diverged.' }
# Compile only the actual pure validation methods, not Setup.exe or its install entry point.
$probe = 'using System; using System.IO; using System.Linq; using System.Xml; using System.Xml.Linq; using System.Web.Script.Serialization; public static class PayloadContractProbe { const string Product="Contentrium Preset", Id="com.contentrium.preset"; ' + $contract.Groups[1].Value + ' public static void Check(string p,string v,bool current){ValidatePayload(p,v,current);} public static void CheckLegacy(string p){ValidatePayload(p,null,false);} }'
Add-Type -TypeDefinition $probe -ReferencedAssemblies @('System.Core','System.Xml','System.Xml.Linq','System.Web.Extensions')
$taskRoot = Join-Path ([IO.Path]::GetTempPath()) ('ContentriumPreset-PayloadContract-' + [guid]::NewGuid().ToString('N'))
$payload = Join-Path $taskRoot 'payload'
$output = Join-Path $taskRoot 'must-not-build'
$results = [Collections.Generic.List[object]]::new()
function Fixture {
    foreach ($file in $required) { $target=Join-Path $payload $file; [IO.Directory]::CreateDirectory((Split-Path -Parent $target))|Out-Null; [IO.File]::WriteAllText($target,'fixture') }
    Copy-Item -LiteralPath (Join-Path $project 'CSXS\manifest.xml') -Destination (Join-Path $payload 'CSXS\manifest.xml') -Force
    [IO.File]::WriteAllText((Join-Path $payload 'package.json'),(@{name='contentrium-preset';version=$payloadVersion}|ConvertTo-Json -Compress))
    [IO.File]::WriteAllText((Join-Path $payload 'library\catalog.json'),(@{product='Contentrium Preset';version=$payloadVersion}|ConvertTo-Json -Compress))
}
function Check([string]$Name,[bool]$Reject) {
    $errorFound=$false;try{[PayloadContractProbe]::Check($payload,$payloadVersion,$true)}catch{$errorFound=$true}
    if($errorFound -ne $Reject){throw "Installer contract unexpected result: $Name"}
    $buildError=$false;try{& (Join-Path $PSScriptRoot 'build-release.ps1') -PayloadRoot $payload -Output $output -Version $payloadVersion -ValidateOnly|Out-Null}catch{$buildError=$true}
    if($buildError -ne $Reject){throw "Build contract unexpected result: $Name"}
    if(Test-Path -LiteralPath $output){throw 'Validation must not compile an installer or produce release output.'}
    $results.Add(@{test=$Name;passed=$true})
}
try {
    Fixture; Check 'valid nine panels and all required files' $false
    foreach($id in @('com.contentrium.preset','com.contentrium.preset.edit','com.contentrium.preset.alt2','com.contentrium.preset.alt3','com.contentrium.preset.alt4','com.contentrium.preset.easing','com.contentrium.preset.keyframes','com.contentrium.preset.anchor','com.contentrium.preset.shifter')) {
        Fixture;[xml]$xml=Get-Content -LiteralPath (Join-Path $payload 'CSXS\manifest.xml') -Raw
        @($xml.ExtensionManifest.ExtensionList.Extension)|Where-Object {$_.Id -eq $id}|ForEach-Object {$_.RemoveAttribute('Version')}
        $xml.Save((Join-Path $payload 'CSXS\manifest.xml'));Check "missing panel version $id" $true
        Fixture;[xml]$xml=Get-Content -LiteralPath (Join-Path $payload 'CSXS\manifest.xml') -Raw
        @($xml.ExtensionManifest.ExtensionList.Extension)|Where-Object {$_.Id -eq $id}|ForEach-Object {$_.Version='1.0.0'}
        $xml.Save((Join-Path $payload 'CSXS\manifest.xml'));Check "incorrect panel version $id" $true
    }
    foreach($file in $required) {
        Fixture;Remove-Item -LiteralPath (Join-Path $payload $file);Check "missing required $file" $true
    }
    foreach($id in @('com.contentrium.preset','com.contentrium.preset.edit','com.contentrium.preset.alt2','com.contentrium.preset.alt3','com.contentrium.preset.alt4','com.contentrium.preset.easing','com.contentrium.preset.keyframes','com.contentrium.preset.anchor','com.contentrium.preset.shifter')) { foreach($resource in @('MainPath','ScriptPath')) {
        Fixture;[xml]$xml=Get-Content -LiteralPath (Join-Path $payload 'CSXS\manifest.xml') -Raw
        $node=@($xml.ExtensionManifest.DispatchInfoList.Extension)|Where-Object {$_.Id -eq $id}
        $node.DispatchInfo.Resources.$resource='./wrong.jsx';$xml.Save((Join-Path $payload 'CSXS\manifest.xml'));Check "incorrect $id $resource" $true
    } }
    Fixture;[xml]$xml=Get-Content -LiteralPath (Join-Path $payload 'CSXS\manifest.xml') -Raw
    $extra=$xml.ExtensionManifest.ExtensionList.Extension[0].CloneNode($true);$xml.ExtensionManifest.ExtensionList.AppendChild($extra)|Out-Null
    $xml.Save((Join-Path $payload 'CSXS\manifest.xml'));Check 'duplicate panel identity' $true
    Fixture;[xml]$xml=Get-Content -LiteralPath (Join-Path $payload 'CSXS\manifest.xml') -Raw
    $xml.ExtensionManifest.DispatchInfoList.RemoveChild($xml.ExtensionManifest.DispatchInfoList.Extension[4])|Out-Null
    $xml.Save((Join-Path $payload 'CSXS\manifest.xml'));Check 'missing secondary dispatch' $true
    Fixture;[IO.File]::WriteAllText((Join-Path $payload 'library/catalog.json'),(@{product='Other';version=$payloadVersion}|ConvertTo-Json -Compress));Check 'incorrect catalog identity' $true
    # Existing older single-panel installs still qualify for backup/upgrade ownership checks.
    [IO.File]::WriteAllText((Join-Path $payload 'CSXS\manifest.xml'),'<ExtensionManifest ExtensionBundleId="com.contentrium.preset" ExtensionBundleVersion="1.0.0"><ExtensionList><Extension Id="com.contentrium.preset" Version="1.0.0"/></ExtensionList></ExtensionManifest>')
    [PayloadContractProbe]::CheckLegacy($payload);$results.Add(@{test='legacy installed payload remains upgradeable';passed=$true})
    . (Join-Path $project 'installer\payload-fixture.ps1')
    New-CompletePayloadFixture $payload '1.0.0' 'old test fixture'
    [PayloadContractProbe]::Check($payload,'1.0.0',$true);$results.Add(@{test='installer QA fixtures satisfy the new incoming contract';passed=$true})
    [pscustomobject]@{tests=$results.Count;passed=$results.Count;results=$results;installerBuilt=$false;installed=$false;published=$false}|ConvertTo-Json -Depth 5
} finally {
    $resolved=[IO.Path]::GetFullPath($taskRoot);$tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
    if(-not $resolved.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or -not (Split-Path -Leaf $resolved).StartsWith('ContentriumPreset-PayloadContract-')){throw 'Unsafe contract-test cleanup path.'}
    if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
