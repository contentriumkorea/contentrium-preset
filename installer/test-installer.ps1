[CmdletBinding()]
param([string]$Setup)
$ErrorActionPreference = 'Stop'
if (-not $Setup) { $Setup = Join-Path $PSScriptRoot 'out\Setup.exe' }
$Setup = [IO.Path]::GetFullPath($Setup)
# Reflection over the .NET Framework installer uses System.Web.Extensions.
# PowerShell 7 runs on .NET and cannot load that Framework-only serializer.
if ($PSVersionTable.PSEdition -eq 'Core') {
    $windowsPowerShell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    if (-not (Test-Path -LiteralPath $windowsPowerShell -PathType Leaf)) { throw 'Windows PowerShell is required for .NET Framework installer tests.' }
    & $windowsPowerShell -NoProfile -File $PSCommandPath -Setup $Setup
    if ($LASTEXITCODE -ne 0) { throw 'Windows PowerShell installer tests failed.' }
    return
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('ContentriumPreset-QA-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($testRoot) | Out-Null
$results = [Collections.Generic.List[object]]::new()
function Assert-True([bool]$Value, [string]$Message) { if (-not $Value) { throw "FAILED: $Message" } }
function Make-Package([string]$Name, [string]$Value, [string]$BadEntry, [string]$CepVersion = '1.0.0') {
    $source = Join-Path $testRoot ($Name + '-source')
    $extension = Join-Path $source 'com.contentrium.preset'
    [IO.Directory]::CreateDirectory((Join-Path $extension 'CSXS')) | Out-Null
    [IO.File]::WriteAllText((Join-Path $extension 'CSXS\manifest.xml'), ('<ExtensionManifest ExtensionBundleId="com.contentrium.preset" ExtensionBundleVersion="VERSION"><ExtensionList><Extension Id="com.contentrium.preset" Version="VERSION"/></ExtensionList></ExtensionManifest>').Replace('VERSION',$CepVersion))
    [IO.File]::WriteAllText((Join-Path $extension 'index.html'), $Value)
    $files = @{}
    foreach ($file in Get-ChildItem -LiteralPath $source -File -Recurse) { $files[$file.FullName.Substring($source.Length + 1).Replace('\','/')] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    [IO.File]::WriteAllText((Join-Path $source 'package-info.json'), (@{schemaVersion=1; product='Contentrium Preset'; extensionId='com.contentrium.preset'; version='1.0.0'; files=$files} | ConvertTo-Json -Depth 5))
    $archive = Join-Path $testRoot ($Name + '.zip')
    [IO.Compression.ZipFile]::CreateFromDirectory($source, $archive)
    if ($BadEntry) {
        $zip = [IO.Compression.ZipFile]::Open($archive, [IO.Compression.ZipArchiveMode]::Update)
        try { $entry = $zip.CreateEntry($BadEntry); $writer = [IO.StreamWriter]::new($entry.Open()); $writer.Write('bad'); $writer.Dispose() } finally { $zip.Dispose() }
    }
    $manifestPath = Join-Path $testRoot ($Name + '.json')
    $manifest = @{ schemaVersion=1; product='Contentrium Preset'; version='1.0.0'; asset='Portable.zip'; sha256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant(); size=(Get-Item -LiteralPath $archive).Length; extensionId='com.contentrium.preset' }
    [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    return @{ manifest=$manifestPath; package=$archive; source=$source }
}
function Invoke-Setup([object]$Package, [string[]]$Extra, [bool]$ExpectSuccess) {
    $args = @('--test-mode','--silent-test','--test-ignore-running-host','--target', ('"' + $target + '"'))
    if ($Package) { $args += @('--manifest', ('"' + $Package.manifest + '"'), '--package', ('"' + $Package.package + '"')) }
    if ($Extra) { $args += $Extra }
    $process = Start-Process -FilePath $Setup -ArgumentList $args -Wait -PassThru -WindowStyle Hidden
    Assert-True (($process.ExitCode -eq 0) -eq $ExpectSuccess) ("unexpected exit code: " + $process.ExitCode)
}
try {
    $target = Join-Path $testRoot 'CEP'
    $other = Join-Path $target 'com.example.other'
    [IO.Directory]::CreateDirectory($other) | Out-Null
    [IO.File]::WriteAllText((Join-Path $other 'keep.txt'), 'other-extension')
    $first = Make-Package 'first' 'one' ''
    Invoke-Setup $first @() $true
    $installed = Join-Path $target 'com.contentrium.preset'
    Assert-True ((Get-Content -LiteralPath (Join-Path $installed 'index.html') -Raw) -eq 'one') 'first installation'
    Assert-True (Test-Path -LiteralPath (Join-Path $target '.test-program\Contentrium Preset\Uninstall.exe')) 'complete program directory'
    $results.Add(@{test='first install and program directory';pass=$true})
    $next = Make-Package 'next' 'two' ''
    Invoke-Setup $next @('--test-fail-after-placement') $false
    Assert-True ((Get-Content -LiteralPath (Join-Path $installed 'index.html') -Raw) -eq 'one') 'rollback restored previous CEP'
    Assert-True (Test-Path -LiteralPath (Join-Path $target '.test-program\Contentrium Preset\Uninstall.exe')) 'rollback restored previous program'
    $results.Add(@{test='update failure rollback';pass=$true})
    Invoke-Setup $next @() $true
    Assert-True ((Get-Content -LiteralPath (Join-Path $installed 'index.html') -Raw) -eq 'two') 'retry update'
    $results.Add(@{test='successful update after retry';pass=$true})
    $programDir = Join-Path $target '.test-program\Contentrium Preset'
    $menuDir = Join-Path $target '.test-start-menu\Contentrium Preset'
    $oldReceipt = Get-Content -LiteralPath (Join-Path $programDir 'install-receipt.json') -Raw
    [IO.File]::WriteAllText((Join-Path $programDir 'old-program-marker.txt'), 'old-program')
    [IO.File]::WriteAllText((Join-Path $menuDir 'old-menu-marker.txt'), 'old-menu')
    Invoke-Setup $first @('--test-fail-registry-restore') $false
    Assert-True ((Get-Content -LiteralPath (Join-Path $installed 'index.html') -Raw) -eq 'two') 'CEP rollback despite registry restore errors'
    Assert-True ((Get-Content -LiteralPath (Join-Path $programDir 'install-receipt.json') -Raw) -eq $oldReceipt) 'old generation program rollback despite registry restore errors'
    Assert-True (Test-Path -LiteralPath (Join-Path $programDir 'old-program-marker.txt')) 'program rollback attempted independently'
    Assert-True (Test-Path -LiteralPath (Join-Path $menuDir 'old-menu-marker.txt')) 'menu rollback attempted independently'
    $results.Add(@{test='registry restoration failures do not prevent filesystem rollback';pass=$true})
    $wrong = Make-Package 'hash' 'bad' ''
    $wrongManifest = Get-Content -LiteralPath $wrong.manifest -Raw | ConvertFrom-Json
    $wrongManifest.sha256 = '0' * 64
    [IO.File]::WriteAllText($wrong.manifest, ($wrongManifest | ConvertTo-Json))
    Invoke-Setup $wrong @() $false
    Assert-True ((Get-Content -LiteralPath (Join-Path $installed 'index.html') -Raw) -eq 'two') 'bad hash preserved install'
    $results.Add(@{test='SHA256 rejection';pass=$true})
    $traversal = Make-Package 'traversal' 'bad' '../escape.txt'
    Invoke-Setup $traversal @() $false
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $testRoot 'escape.txt'))) 'zip traversal rejected'
    $results.Add(@{test='ZIP traversal rejection';pass=$true})
    $duplicate = Make-Package 'duplicate' 'bad' 'com.contentrium.preset/INDEX.HTML'
    Invoke-Setup $duplicate @() $false
    $results.Add(@{test='case-insensitive ZIP duplicate rejection';pass=$true})
    $device = Make-Package 'device' 'bad' 'com.contentrium.preset/NUL.txt'
    Invoke-Setup $device @() $false
    $results.Add(@{test='Windows device-name rejection';pass=$true})
    $metadata = Make-Package 'metadata' 'bad' ''
    $metadataRecord = Get-Content -LiteralPath $metadata.manifest -Raw | ConvertFrom-Json
    $metadataRecord.version = '1.0.1'
    [IO.File]::WriteAllText($metadata.manifest, ($metadataRecord | ConvertTo-Json))
    Invoke-Setup $metadata @() $false
    $results.Add(@{test='release and package version mismatch rejection';pass=$true})
    $cepMismatch = Make-Package 'cep-mismatch' 'bad' '' '1.0.2'
    Invoke-Setup $cepMismatch @() $false
    $results.Add(@{test='CEP and package version mismatch rejection';pass=$true})
    Invoke-Setup $null @('--offline-directory', ('"' + $first.source + '"')) $true
    Assert-True ((Get-Content -LiteralPath (Join-Path $installed 'index.html') -Raw) -eq 'one') 'offline installation'
    $results.Add(@{test='complete offline directory installation';pass=$true})
    [IO.File]::WriteAllText((Join-Path $first.source 'unknown.js'), 'untracked')
    Invoke-Setup $null @('--offline-directory', ('"' + $first.source + '"')) $false
    $results.Add(@{test='untracked offline file rejection';pass=$true})
    Invoke-Setup $null @('--uninstall') $true
    Assert-True (-not (Test-Path -LiteralPath $installed)) 'owned CEP removed'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $target '.test-program\Contentrium Preset'))) 'owned program removed'
    Assert-True ((Get-Content -LiteralPath (Join-Path $other 'keep.txt') -Raw) -eq 'other-extension') 'other extension preserved'
    $results.Add(@{test='uninstall and other-extension preservation';pass=$true})
    Invoke-Setup $next @() $true
    $runningUninstaller = Join-Path $target '.test-program\Contentrium Preset\Uninstall.exe'
    $selfArgs = @('--test-mode','--silent-test','--uninstall','--test-ignore-running-host','--target', ('"' + $target + '"'))
    $selfError = Join-Path $testRoot 'self-uninstall-error.txt'
    $selfOutput = Join-Path $testRoot 'self-uninstall-output.txt'
    $self = Start-Process -FilePath $runningUninstaller -ArgumentList $selfArgs -Wait -PassThru -WindowStyle Hidden -RedirectStandardError $selfError -RedirectStandardOutput $selfOutput
    Assert-True ($self.ExitCode -eq 0) ('running copied uninstaller exited successfully: ' + (Get-Content -LiteralPath $selfError -Raw))
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while ((Test-Path -LiteralPath (Split-Path -Parent $runningUninstaller)) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 100 }
    Assert-True (-not (Test-Path -LiteralPath (Split-Path -Parent $runningUninstaller))) 'running uninstaller removed its own program directory'
    Assert-True ((Get-Content -LiteralPath (Join-Path $other 'keep.txt') -Raw) -eq 'other-extension') 'self uninstall preserved other extension'
    $results.Add(@{test='running copied uninstaller self deletion';pass=$true})
    Invoke-Setup $next @() $true
    $oldGeneration = (Get-Content -LiteralPath (Join-Path $programDir 'install-receipt.json') -Raw | ConvertFrom-Json).installationId
    $holdArgs = @('--test-mode','--silent-test','--uninstall','--test-ignore-running-host','--test-hold-after-uninstall','--target', ('"' + $target + '"'))
    $delayed = Start-Process -FilePath (Join-Path $programDir 'Uninstall.exe') -ArgumentList $holdArgs -PassThru -WindowStyle Hidden
    $holdDeadline = [DateTime]::UtcNow.AddSeconds(10)
    while (-not (Test-Path -LiteralPath (Join-Path $target 'uninstall-waiting')) -and [DateTime]::UtcNow -lt $holdDeadline) { Start-Sleep -Milliseconds 50 }
    Assert-True (Test-Path -LiteralPath (Join-Path $target 'uninstall-waiting')) 'old uninstaller held alive after successful removal phase'
    Invoke-Setup $next @() $true
    $newGeneration = (Get-Content -LiteralPath (Join-Path $programDir 'install-receipt.json') -Raw | ConvertFrom-Json).installationId
    Assert-True ($newGeneration -ne $oldGeneration) 'same-version reinstall generated new installation ID'
    [IO.File]::WriteAllText((Join-Path $target 'release-uninstaller'), 'close-old-window')
    $delayed.WaitForExit()
    Start-Sleep -Milliseconds 1000
    Assert-True (Test-Path -LiteralPath (Join-Path $programDir 'Uninstall.exe')) 'old cleanup preserved new program directory'
    Assert-True (((Get-Content -LiteralPath (Join-Path $programDir 'install-receipt.json') -Raw | ConvertFrom-Json).installationId) -eq $newGeneration) 'old cleanup preserved new installation ID'
    Assert-True ((Get-Content -LiteralPath (Join-Path $installed 'index.html') -Raw) -eq 'two') 'old cleanup preserved new CEP'
    $results.Add(@{test='delayed old cleanup cannot delete same-version reinstall';pass=$true})
    Invoke-Setup $null @('--uninstall') $true
    Add-Type -AssemblyName System.Web.Extensions
    $assembly = [Reflection.Assembly]::LoadFrom($Setup)
    $installerType = $assembly.GetType('ContentriumPreset.Installer')
    $serializer = [Web.Script.Serialization.JavaScriptSerializer]::new()
    $releaseJson = '{"assets":[{"name":"Portable.zip","browser_download_url":"https://github.com/contentriumkorea/contentrium-preset/releases/download/v1.0.0/Portable.zip"}]}'
    $release = $serializer.Deserialize($releaseJson, [Collections.Generic.Dictionary[string,object]])
    $assetMethod = $installerType.GetMethod('AssetUrl', [Reflection.BindingFlags]'NonPublic,Static')
    Assert-True ($assetMethod.Invoke($null, @($release,'Portable.zip')) -eq 'https://github.com/contentriumkorea/contentrium-preset/releases/download/v1.0.0/Portable.zip') 'GitHub API asset shape'
    $httpsMethod = $installerType.GetMethod('CheckHttps')
    foreach ($badUri in @('http://github.com/file','https://github.com.evil.test/file','https://user:secret@github.com/file','https://github.com:444/file')) {
        $rejected = $false
        try { $httpsMethod.Invoke($null, @([uri]$badUri)) } catch {
            $errorException = $_.Exception
            while ($errorException.InnerException) { $errorException = $errorException.InnerException }
            if ($errorException -is [IO.InvalidDataException]) { $rejected = $true } else { throw }
        }
        Assert-True $rejected 'unsafe download URI rejected'
    }
    $results.Add(@{test='GitHub asset parsing and HTTPS allowlist';pass=$true})
    [pscustomobject]@{ tests=$results.Count; passed=$results.Count; results=$results; realAdobeModified=$false; registryModified=$false } | ConvertTo-Json -Depth 5
} finally {
    $resolved = [IO.Path]::GetFullPath($testRoot)
    $allowed = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if ($resolved.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolved).StartsWith('ContentriumPreset-QA-')) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
