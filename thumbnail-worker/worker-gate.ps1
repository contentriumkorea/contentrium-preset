# Exclusive controller file handle + durable intent. No dead-panel/PID heuristic reclamation.
function Set-WorkerGate($Stream,$Value){$bytes=[Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Depth 5));$Stream.Position=0;$Stream.SetLength(0);$Stream.Write($bytes,0,$bytes.Length);$Stream.Flush($true)}
function Acquire-WorkerGate([string]$GatePath,$Bound,[string]$ManifestSHA256){
 if((Test-Path -LiteralPath $GatePath) -and ((Get-Item -LiteralPath $GatePath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'WORKER_GATE_REPARSE_REFUSED'}
 $stream=[IO.File]::Open($GatePath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
 try{
  if($stream.Length -gt 16384){throw 'WORKER_GATE_TOO_LARGE'}
  if($stream.Length -gt 0){
   $reader=[IO.StreamReader]::new($stream,[Text.Encoding]::UTF8,$true,1024,$true);try{$old=$reader.ReadToEnd()|ConvertFrom-Json}finally{$reader.Dispose()}
   Assert-Fields $old @('schema','state','runId','manifestPath','manifestSha256','readbackPath','readbackSha256')
   if($old.schema -ne 1 -or $old.state -cne 'terminal' -or $old.runId -cnotmatch '^[a-f0-9-]{36}$' -or $old.manifestSha256 -cnotmatch '^[a-f0-9]{64}$' -or $old.readbackSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'PRIOR_NATIVE_STATE_UNKNOWN_NO_RELAUNCH'}
   $ownedDir=Join-Path (Join-Path (Split-Path -Parent $GatePath) 'runs') $old.runId
   if($old.manifestPath -cne (Join-Path $ownedDir 'manifest.json') -or $old.readbackPath -cne (Join-Path $ownedDir 'readback.json') -or (Hash-OwnFile $old.manifestPath) -cne $old.manifestSha256 -or (Hash-OwnFile $old.readbackPath) -cne $old.readbackSha256){throw 'PRIOR_TERMINAL_RECEIPT_CHANGED'}
   $before=Get-Content -LiteralPath $old.readbackPath -Encoding UTF8 -Raw|ConvertFrom-Json
   if($before.naturalExitAndOutputQualified -isnot [bool] -or !$before.naturalExitAndOutputQualified -or $before.nativeCleanupPending -isnot [bool] -or $before.nativeCleanupPending -or $before.sourcePrePostHashesMatch -isnot [bool] -or !$before.sourcePrePostHashesMatch -or $before.nonceMatches -isnot [bool] -or !$before.nonceMatches -or $before.direct.hasExited -isnot [bool] -or !$before.direct.hasExited -or !(Test-JSONNumber $before.direct.exitCode) -or $before.direct.exitCode -ne 0 -or $before.nonMainProcesses -isnot [array] -or $before.nonMainProcesses.Count -ne 0 -or !$before.stdout.copyCompleted -or !$before.stderr.copyCompleted){throw 'PRIOR_NATIVE_STATE_UNKNOWN_NO_RELAUNCH'}
  }
  $record=[ordered]@{schema=1;state='intent';runId=$Bound.runId;manifestPath=(Join-Path $Bound.runDirectory 'manifest.json');manifestSha256=$ManifestSHA256;readbackPath=$null;readbackSha256=$null}
  Set-WorkerGate $stream $record;return [pscustomobject]@{stream=$stream;record=$record}
 }catch{$stream.Dispose();throw}
}
function Complete-WorkerGate($Gate,[string]$ReadbackPath){$record=$Gate.record;$record.state='terminal';$record.readbackPath=$ReadbackPath;$record.readbackSha256=Hash-OwnFile $ReadbackPath;Set-WorkerGate $Gate.stream $record}
