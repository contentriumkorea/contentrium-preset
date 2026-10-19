param([Parameter(Mandatory=$true)][string]$Request)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$job = Get-Content -LiteralPath $Request -Raw -Encoding UTF8 | ConvertFrom-Json
function Write-ProgressFile($Value) { [IO.File]::WriteAllText($job.progress, ($Value | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false)) }
function Safe-Name([string]$Name) {
    if (-not $Name -or $Name.Contains('\') -or $Name.StartsWith('/') -or $Name -match '[:\x00-\x1f<>"|?*]') { throw 'Invalid ZIP path' }
    foreach ($part in $Name.Split('/')) {
        if (-not $part -or $part -in @('.','..') -or $part -match '[. ]$' -or $part -match '^(?i:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)') { throw 'Unsafe ZIP path' }
    }
    if ($Name -notmatch '^(?:contentrium-pack\.json|catalog\.json|recipes/cpr_[a-f0-9]{24}\.cpr\.json|previews/cpr_[a-f0-9]{24}\.webm|operations/(?:index\.json|text-index\.json|cpr_[a-f0-9]{24}\.operations\.json)|sounds/.+\.wav)$') { throw 'Unsupported pack file' }
}
if ($job.mode -eq 'build') {
    $manifestText = [IO.File]::ReadAllText($job.manifest)
    $manifest = $manifestText | ConvertFrom-Json
    $stream = [IO.File]::Open($job.archive, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try {
        $zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $true)
        try {
            $entry = $zip.CreateEntry('contentrium-pack.json', [IO.Compression.CompressionLevel]::Fastest)
            $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false)); try { $writer.Write($manifestText) } finally { $writer.Dispose() }
            $count=0; [long]$bytes=0
            foreach ($file in $job.sources) {
                Safe-Name $file.path
                $inputStream = [IO.File]::OpenRead($file.source)
                try { $outputStream = $zip.CreateEntry($file.path, [IO.Compression.CompressionLevel]::Fastest).Open(); try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose() } } finally { $inputStream.Dispose() }
                $count++; $bytes += $file.size
                if ($count % 100 -eq 0) { Write-ProgressFile @{phase='compress';files=$count;bytes=$bytes;total=$manifest.totalBytes} }
            }
        } finally { $zip.Dispose() }
    } finally { $stream.Dispose() }
    Write-ProgressFile @{phase='complete';files=$count;bytes=$bytes;total=$manifest.totalBytes}
    return
}
if ($job.mode -ne 'extract') { throw 'Unknown ZIP operation' }
# This extractor never executes archive content. Every path is checked before any output is created.
$zip = [IO.Compression.ZipFile]::OpenRead($job.archive)
try {
    if ($zip.Entries.Count -lt 2 -or $zip.Entries.Count -gt 50001) { throw 'ZIP file count limit' }
    $all = @{}; [long]$total=0; $manifestEntry=$null
    foreach ($entry in $zip.Entries) {
        Safe-Name $entry.FullName
        if ($all.ContainsKey($entry.FullName)) { throw 'Duplicate ZIP path' }
        if (($entry.ExternalAttributes -band 0x400) -ne 0 -or (($entry.ExternalAttributes -shr 16) -band 0xf000) -eq 0xa000) { throw 'ZIP links are forbidden' }
        if ($entry.Length -lt 0 -or $entry.Length -gt 2147483648) { throw 'ZIP entry size limit' }
        $total += $entry.Length; if ($total -gt 68719476736) { throw 'ZIP expanded size limit' }
        $all[$entry.FullName]=$entry
        if ($entry.FullName -ceq 'contentrium-pack.json') { $manifestEntry=$entry }
    }
    if (-not $manifestEntry -or $manifestEntry.Length -gt 16777216) { throw 'Missing or oversized pack manifest' }
    $reader = [IO.StreamReader]::new($manifestEntry.Open(), [Text.UTF8Encoding]::new($false,$true))
    try { $text=[Text.StringBuilder]::new(); $chars=New-Object char[] 65536; while (($received=$reader.Read($chars,0,$chars.Length)) -gt 0) { if ($text.Length+$received -gt 16777216) { throw 'Manifest stream size limit' }; $null=$text.Append($chars,0,$received) }; $manifestText=$text.ToString() } finally { $reader.Dispose() }
    $manifest = $manifestText | ConvertFrom-Json
    if ($manifest.schemaVersion -ne 1 -or $manifest.product -cne 'Contentrium Preset' -or $manifest.kind -cne 'contentrium-preset-pack' -or @($manifest.files).Count -ne ($all.Count-1)) { throw 'Invalid pack manifest' }
    $listed=@{}; [long]$declared=0
    foreach ($row in $manifest.files) {
        Safe-Name $row.path
        if ($row.path -ceq 'contentrium-pack.json' -or $listed.ContainsKey($row.path) -or -not $all.ContainsKey($row.path) -or $row.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $row.size -ne $all[$row.path].Length) { throw 'Manifest file identity mismatch' }
        $listed[$row.path]=$row; $declared += $row.size
    }
    if ($declared -ne $manifest.totalBytes) { throw 'Manifest expanded size mismatch' }
    $stage=[IO.Path]::GetFullPath($job.stage).TrimEnd('\')
    if (Test-Path -LiteralPath $stage) { throw 'Fresh pack extraction directory required' }
    [IO.Directory]::CreateDirectory($stage) | Out-Null
    [IO.File]::WriteAllText((Join-Path $stage 'contentrium-pack.json'),$manifestText,[Text.UTF8Encoding]::new($false))
    $count=0; [long]$copied=0; $buffer=New-Object byte[] 1048576
    foreach ($row in $manifest.files) {
        $target=[IO.Path]::GetFullPath((Join-Path $stage $row.path.Replace('/','\')))
        if (-not $target.StartsWith($stage+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'ZIP escaped extraction root' }
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
        $inputStream=$all[$row.path].Open(); $outputStream=[IO.File]::Open($target,[IO.FileMode]::CreateNew); $sha=[Security.Cryptography.SHA256]::Create(); [long]$length=0
        try {
            while (($received=$inputStream.Read($buffer,0,$buffer.Length)) -gt 0) {
                $length += $received; if ($length -gt $row.size) { throw 'ZIP stream exceeds declared size' }
                $outputStream.Write($buffer,0,$received); $null=$sha.TransformBlock($buffer,0,$received,$buffer,0)
            }
            $null=$sha.TransformFinalBlock($buffer,0,0)
            $digest=[BitConverter]::ToString($sha.Hash).Replace('-','').ToLowerInvariant()
            if ($length -ne $row.size -or $digest -cne $row.sha256) { throw 'Pack file hash mismatch' }
        } finally { $inputStream.Dispose(); $outputStream.Dispose(); $sha.Dispose() }
        $count++; $copied += $length
        if ($count % 100 -eq 0) { Write-ProgressFile @{phase='extract';files=$count;bytes=$copied;total=$declared} }
    }
    Write-ProgressFile @{phase='complete';files=$count;bytes=$copied;total=$declared}
} finally { $zip.Dispose() }
