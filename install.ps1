[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$setup = Join-Path $PSScriptRoot 'Setup.exe'
if (-not (Test-Path -LiteralPath $setup -PathType Leaf)) { throw 'Portable.zip을 모두 압축 해제한 뒤 Install.cmd를 실행해 주세요.' }
if (Get-Process -Name AfterFX -ErrorAction SilentlyContinue) { throw '프로젝트를 저장하고 After Effects를 닫은 뒤 다시 실행해 주세요.' }
# Explicit user execution of Install.cmd opens the bundled offline installer.
$process = Start-Process -FilePath $setup -ArgumentList @('--offline-directory', ('"' + $PSScriptRoot + '"')) -Wait -PassThru -WindowStyle Normal
if ($process.ExitCode -ne 0) { throw "Contentrium Preset 설치가 완료되지 않았습니다. 오류 코드: $($process.ExitCode)" }
