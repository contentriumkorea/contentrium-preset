[CmdletBinding()]
param([string]$Setup)
$ErrorActionPreference='Stop'
if (-not $Setup) { $Setup=Join-Path $PSScriptRoot 'out\Setup.exe' }
$Setup=[IO.Path]::GetFullPath($Setup)
if ($PSVersionTable.PSEdition -eq 'Core') {
    & (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -NoProfile -File $PSCommandPath -Setup $Setup
    if ($LASTEXITCODE -ne 0) { throw 'Unattended installer tests failed.' }
    return
}
$assembly=[Reflection.Assembly]::LoadFrom($Setup)
$parse=$assembly.GetType('ContentriumPreset.Options').GetMethod('Parse')
$taskRoot=Join-Path ([IO.Path]::GetTempPath()) ('ContentriumPreset-SilentQA-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($taskRoot) | Out-Null
$results=[Collections.Generic.List[object]]::new()
function Assert-True([bool]$Value,[string]$Message) { if (-not $Value) { throw $Message } }
function Parse-Options([string[]]$Values) { return $parse.Invoke($null,@(,$Values)) }
function Run-Setup([string]$Exe,[string[]]$Values,[int]$Expected) {
    $start=[Diagnostics.ProcessStartInfo]::new()
    $start.FileName=$Exe;$start.Arguments=$Values -join ' ';$start.UseShellExecute=$false;$start.CreateNoWindow=$true
    $start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden;$start.RedirectStandardError=$true;$start.RedirectStandardOutput=$true
    $process=[Diagnostics.Process]::new();$process.StartInfo=$start
    [void]$process.Start()
    $stderr=$process.StandardError.ReadToEndAsync();$stdout=$process.StandardOutput.ReadToEndAsync()
    if (-not $process.WaitForExit(20000)) { $process.Kill(); $process.WaitForExit(); throw 'Unattended installer did not exit; its owned test process was stopped.' }
    $process.WaitForExit()
    Assert-True ($process.ExitCode -eq $Expected) ('Unexpected unattended exit code: '+$process.ExitCode)
    return @{stderr=$stderr.GetAwaiter().GetResult();stdout=$stdout.GetAwaiter().GetResult()}
}
try {
    $gui=Parse-Options @()
    Assert-True (-not $gui.Silent -and -not $gui.Test) 'GUI must remain the default.'
    $results.Add(@{test='default remains GUI';pass=$true})
    $online=Parse-Options @('--silent')
    $remove=Parse-Options @('--silent','--uninstall')
    $offline=Parse-Options @('--silent','--offline-directory',$taskRoot)
    Assert-True ($online.Silent -and -not $online.Test -and -not $online.Target -and -not $online.Manifest -and -not $online.Package) 'Online unattended options changed production inputs.'
    Assert-True ($remove.Silent -and $remove.Uninstall -and -not $remove.Test) 'Production uninstall options failed.'
    Assert-True ($offline.Silent -and -not $offline.Test -and $offline.Offline -eq $taskRoot) 'Offline unattended options failed.'
    $results.Add(@{test='production online offline uninstall parser';pass=$true})
    foreach ($values in @(@('--silent','--target',$taskRoot),@('--silent','--manifest',$taskRoot),@('--silent','--package',$taskRoot),@('--silent','--test-ignore-running-host'),@('--silent','--test-fail-after-placement'),@('--silent','--test-fail-registry-restore'),@('--silent','--test-hold-after-uninstall'),@('--silent-test'))) {
        $rejected=$false
        try { Parse-Options $values | Out-Null } catch { $rejected=$true }
        Assert-True $rejected ('Production test-only inputs accepted: '+($values -join ' '))
    }
    $results.Add(@{test='production cannot override manifest package target or host guard';pass=$true})
    $invalid=Run-Setup $Setup @('--silent','--target',('"'+$taskRoot+'"')) 1
    Assert-True ($invalid.stderr.Length -gt 0) 'Unattended parse failure did not write stderr.'
    $results.Add(@{test='production parse failure exits nonzero without GUI';pass=$true})
    $source=Join-Path $taskRoot 'offline'
    $extension=Join-Path $source 'com.contentrium.preset'
    [IO.Directory]::CreateDirectory((Join-Path $extension 'CSXS')) | Out-Null
    [IO.File]::WriteAllText((Join-Path $extension 'CSXS\manifest.xml'),'<ExtensionManifest ExtensionBundleId="com.contentrium.preset" ExtensionBundleVersion="1.1.0"><ExtensionList><Extension Id="com.contentrium.preset" Version="1.1.0"/></ExtensionList></ExtensionManifest>')
    [IO.File]::WriteAllText((Join-Path $extension 'index.html'),'silent-fixture')
    $hashes=@{}
    foreach ($file in Get-ChildItem -LiteralPath $source -File -Recurse) { $hashes[$file.FullName.Substring($source.Length+1).Replace('\','/')]=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    [IO.File]::WriteAllText((Join-Path $source 'package-info.json'),(@{schemaVersion=1;product='Contentrium Preset';version='1.1.0';extensionId='com.contentrium.preset';files=$hashes}|ConvertTo-Json -Depth 5))
    $target=Join-Path $taskRoot 'CEP'
    $other=Join-Path $target 'other.extension'
    [IO.Directory]::CreateDirectory($other) | Out-Null
    [IO.File]::WriteAllText((Join-Path $other 'keep.txt'),'preserve')
    $base=@('--silent','--test-mode','--test-ignore-running-host','--target',('"'+$target+'"'))
    $installed=Join-Path $target 'com.contentrium.preset'
    $install=Run-Setup $Setup ($base+@('--offline-directory',('"'+$source+'"'))) 0
    Assert-True (([IO.File]::ReadAllText((Join-Path $installed 'index.html'))) -eq 'silent-fixture') 'Unattended install skipped the common installer.'
    Assert-True ($install.stdout.Contains('100%')) 'Unattended progress did not reach stdout.'
    Assert-True ($install.stdout.Contains([regex]::Unescape('\uC124\uCE58 \uC644\uB8CC'))) 'Unattended Korean progress was not readable as UTF-8.'
    $results.Add(@{test='silent flag uses full common offline install in isolated target';pass=$true})
    [IO.File]::WriteAllText((Join-Path $extension 'index.html'),'tampered')
    $failure=Run-Setup $Setup ($base+@('--offline-directory',('"'+$source+'"'))) 1
    Assert-True ($failure.stderr.Length -gt 0) 'Validation error did not reach stderr.'
    Assert-True ($failure.stderr.Contains([regex]::Unescape('\uD328\uD0A4\uC9C0'))) 'Unattended Korean stderr was not readable as UTF-8.'
    Assert-True (([IO.File]::ReadAllText((Join-Path $installed 'index.html'))) -eq 'silent-fixture') 'Failed silent validation changed the previous install.'
    $results.Add(@{test='silent validation failure preserves installation and writes stderr';pass=$true})
    $program=Join-Path $target '.test-program\Contentrium Preset'
    Run-Setup (Join-Path $program 'Uninstall.exe') ($base+@('--uninstall')) 0 | Out-Null
    $deadline=[DateTime]::UtcNow.AddSeconds(20)
    while ((Test-Path -LiteralPath $program) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 100 }
    Assert-True (-not (Test-Path -LiteralPath $installed) -and -not (Test-Path -LiteralPath $program)) 'Silent self-uninstall did not complete.'
    Assert-True ([IO.File]::ReadAllText((Join-Path $other 'keep.txt')) -eq 'preserve') 'Silent uninstall changed another extension.'
    $results.Add(@{test='silent copied uninstaller cleans itself and preserves other extensions';pass=$true})
    [pscustomobject]@{tests=$results.Count;passed=$results.Count;results=$results;productionInstallInvoked=$false;realAdobeModified=$false;registryModified=$false}|ConvertTo-Json -Depth 5
} finally {
    $resolved=[IO.Path]::GetFullPath($taskRoot)
    $allowed=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
    if (-not $resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or -not (Split-Path -Leaf $resolved).StartsWith('ContentriumPreset-SilentQA-')) { throw 'Unsafe silent-test cleanup target.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
