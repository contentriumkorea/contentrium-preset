[CmdletBinding()]
param([string]$Output)
$ErrorActionPreference = 'Stop'
if (-not $Output) { $Output = Join-Path $PSScriptRoot 'out\Setup.exe' }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path -LiteralPath $compiler)) { throw '.NET Framework C# compiler was not found.' }
$framework = Split-Path -Parent $compiler
$outputPath = [IO.Path]::GetFullPath($Output)
[IO.Directory]::CreateDirectory((Split-Path -Parent $outputPath)) | Out-Null
$references = @('System.dll','System.Core.dll','System.Windows.Forms.dll','System.Drawing.dll','System.Web.Extensions.dll','System.Xml.dll','System.Xml.Linq.dll','System.IO.Compression.dll','System.IO.Compression.FileSystem.dll')
$compileArgs = @('/nologo','/target:winexe','/platform:anycpu','/optimize+','/codepage:65001',("/out:$outputPath"),("/win32manifest:" + (Join-Path $PSScriptRoot 'app.manifest')))
foreach ($reference in $references) { $compileArgs += '/reference:' + (Join-Path $framework $reference) }
$compileArgs += Join-Path $PSScriptRoot 'Setup.cs'
& $compiler @compileArgs
if ($LASTEXITCODE -ne 0) { throw 'Setup compilation failed.' }
$file = Get-Item -LiteralPath $outputPath
[pscustomobject]@{ path = $file.FullName; bytes = $file.Length; sha256 = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant() } | ConvertTo-Json
