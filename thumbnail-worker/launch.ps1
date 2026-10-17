param([Parameter(Mandatory=$true)][string]$ManifestPath,[Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedManifestSHA256,[ValidateRange(1,120)][int]$TimeoutSeconds=120)
# Fixed AEP preview worker; no source/main save or shutdown.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function Hash-OwnFile([string]$FilePath){(Get-FileHash -LiteralPath $FilePath -Algorithm SHA256).Hash.ToLowerInvariant()}
function Write-Once([string]$FilePath,$Value){$bytes=[Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Depth 12));$stream=[IO.File]::Open($FilePath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read);try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush()}finally{$stream.Dispose()}}
function Assert-Caller($Manifest){
 $sessionPath=Join-Path (Join-Path $Manifest.workerRoot '.lease-owners') ($Manifest.caller.windowKey+'.json')
 if($Manifest.caller.windowKey -cnotmatch '^[a-f0-9]{64}$' -or $Manifest.caller.ownerId -cnotmatch '^[a-f0-9]{32}$'){throw 'CALLER_IDENTITY_REQUIRED'}
 $session=Get-Content -LiteralPath $sessionPath -Encoding UTF8 -Raw|ConvertFrom-Json
 if($session.owner -cne $Manifest.caller.ownerId -or ($session.PSObject.Properties.Name -contains 'closed' -and $session.closed)){throw 'CALLER_SESSION_REPLACED'}
 foreach($expected in @($Manifest.host.renderer,$Manifest.host.bridge)){$rows=@(Get-CimInstance -ClassName Win32_Process -OperationTimeoutSec 5 -Filter ('ProcessId='+[int]$expected.processId));if($rows.Count -ne 1){throw 'CALLER_PROCESS_DISAPPEARED'};$r=$rows[0];if($r.ParentProcessId -ne $expected.parentProcessId -or $r.SessionId -ne $expected.sessionId -or $r.ExecutablePath -ine $expected.executablePath -or ([DateTime]$r.CreationDate).ToUniversalTime().Ticks -ne ([DateTime]$expected.createdUtc).ToUniversalTime().Ticks){throw 'CALLER_PROCESS_CHANGED'}}
}
function Get-AEProcesses{
 @(Get-CimInstance -ClassName Win32_Process -OperationTimeoutSec 5 -Filter "Name='AfterFX.exe' OR Name='AfterFX.com'"|ForEach-Object{
  [pscustomobject]@{processId=[int]$_.ProcessId;parentProcessId=[int]$_.ParentProcessId;sessionId=[int]$_.SessionId;createdUtc=([DateTime]$_.CreationDate).ToUniversalTime().ToString('o');executablePath=$_.ExecutablePath}
 })
}
function Assert-MainSnapshot($Rows,$Experiment,[bool]$Baseline){
 $rowsArray=@($Rows)
 if($Experiment.mode -ceq 'closed-main'){
  if($null -ne $Experiment.mainHost){throw 'CLOSED_MODE_MAIN_MUST_BE_NULL'}
  if($Baseline -and $rowsArray.Count -ne 0){throw 'CLOSED_CALIBRATION_REQUIRES_ALL_MAIN_AE_PROCESSES_CLOSED'}
  return $true
 }
 if($Experiment.mode -cne 'open-main' -or $null -eq $Experiment.mainHost){throw 'EXPLICIT_EXPERIMENT_MODE_REQUIRED'}
 $expected=$Experiment.mainHost
 $match=@($rowsArray|Where-Object{$_.processId -eq $expected.processId})
 if($match.Count -ne 1 -or ($Baseline -and $rowsArray.Count -ne 1)){throw 'EXACT_EXPECTED_MAIN_PROCESS_REQUIRED'}
 $row=$match[0]
 if($row.sessionId -ne $expected.sessionId -or $row.executablePath -ine $expected.executablePath -or ([DateTime]$row.createdUtc).ToUniversalTime().Ticks -ne ([DateTime]$expected.createdUtc).ToUniversalTime().Ticks){throw 'EXPECTED_MAIN_IDENTITY_CHANGED'}
 if((Hash-OwnFile $row.executablePath) -cne $expected.imageSha256){throw 'EXPECTED_MAIN_IMAGE_CHANGED'}
 return $true
}
function Assert-OwnedSource($Source,$NodeWitness){
 if(![IO.Path]::IsPathRooted($Source.path) -or [IO.Path]::GetFullPath($Source.path) -cne $Source.path -or $Source.sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'EXACT_SOURCE_PIN_REQUIRED'}
 $current=$Source.path;$first=$true
 while($current){
  $item=Get-Item -LiteralPath $current -Force
  if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'SOURCE_REPARSE_POINT_REFUSED'}
  if($first){if($item.PSIsContainer -or $item.Length -ne $Source.bytes){throw 'SOURCE_SIZE_OR_TYPE_CHANGED'};$first=$false}
  $parent=[IO.Path]::GetDirectoryName($current);if($parent -ceq $current){break};$current=$parent
 }
 if($Source.PSObject.Properties.Name -ccontains 'sourceStamp'){if($Source.sourceStamp.kind -cne 'project' -or $Source.sourceStamp.path -cne $Source.path.Replace('\','/').ToLowerInvariant() -or $Source.sourceStamp.size -ne $Source.bytes){throw 'SOURCE_STAMP_CHANGED'}}

 Assert-Fields $NodeWitness @('size','mtimeNs')
 if(!(Test-JSONNumber $NodeWitness.size) -or $NodeWitness.size -ne $Source.bytes -or $NodeWitness.mtimeNs -isnot [string] -or $NodeWitness.mtimeNs -cnotmatch '^[0-9]{1,20}$'){throw 'PRECISE_NODE_SOURCE_WITNESS_REQUIRED'}
 $fileInfo=Get-Item -LiteralPath $Source.path -Force;$actualNs=(([bigint]$fileInfo.LastWriteTimeUtc.Ticks-[bigint]621355968000000000)*100).ToString([Globalization.CultureInfo]::InvariantCulture)
 if($actualNs -cne $NodeWitness.mtimeNs){throw 'PRECISE_SOURCE_STAT_CHANGED'}
 $digest=Hash-OwnFile $Source.path
 if($digest -cne $Source.sha256){throw 'SOURCE_BYTES_CHANGED'}
 return @{path=$Source.path;sha256=$digest;bytes=$Source.bytes;nonLinkAncestorsVerified=$true}
}
function Get-ObservationDisposition($Handshake,$Direct,[bool]$StdoutComplete,[bool]$StderrComplete){
 if($null -eq $Handshake){return 'waiting-handshake'}
 if($Direct.hasExited -ne $true){return 'waiting-exit'}
 if(!$StdoutComplete -or !$StderrComplete){return 'waiting-output'}
 return 'complete'
}
function Read-DirectState($Process){
 $state=[ordered]@{processId=$null;hasExited=$null;exitCode=$null;sessionId=$null;errors=@()}
 if($null -eq $Process){return [pscustomobject]$state}
 try{$Process.Refresh()}catch{$state.errors+=('refresh:'+ $_.Exception.Message)}
 try{$state.processId=$Process.Id}catch{$state.errors+=('pid:'+ $_.Exception.Message)}
 try{$state.hasExited=$Process.HasExited}catch{$state.errors+=('exit-state:'+ $_.Exception.Message)}
 if($state.hasExited -eq $true){try{$state.exitCode=$Process.ExitCode}catch{$state.errors+=('exit-code:'+ $_.Exception.Message)}}
 try{$state.sessionId=$Process.SessionId}catch{$state.errors+=('session:'+ $_.Exception.Message)}
 return [pscustomobject]$state
}
function Read-Capture([string]$FilePath,$Task,$FileStream){
 $done=$null -ne $Task -and $Task.Status -eq [Threading.Tasks.TaskStatus]::RanToCompletion
 $fault=$null;$metadataErrors=@();$exists=$false;$bytes=0;$digest=$null
 if($null -ne $Task -and $Task.IsFaulted){$fault=$Task.Exception.ToString()}
 if($null -ne $FileStream -and ($null -eq $Task -or $Task.IsCompleted)){try{$FileStream.Dispose()}catch{$metadataErrors+=('close:'+ $_.Exception.Message)}}
 try{$exists=Test-Path -LiteralPath $FilePath;if($exists){$bytes=(Get-Item -LiteralPath $FilePath).Length;if($done){$digest=Hash-OwnFile $FilePath}}}catch{$metadataErrors+=('metadata:'+ $_.Exception.Message)}
 return @{file=$FilePath;exists=$exists;bytes=$bytes;sha256=$digest;copyCompleted=$done;copyFault=$fault;metadataErrors=$metadataErrors}
}
if(![IO.Path]::IsPathRooted($ManifestPath) -or (Hash-OwnFile $ManifestPath) -ne $ExpectedManifestSHA256){throw 'PINNED_MANIFEST_REQUIRED'}
$bound=Get-Content -LiteralPath $ManifestPath -Encoding UTF8 -Raw|ConvertFrom-Json
$runDir=[IO.Path]::GetFullPath($bound.runDirectory)
if([IO.Path]::GetFullPath([IO.Path]::GetDirectoryName($ManifestPath)) -ne $runDir -or $bound.schema -ne 1 -or $bound.projectMutationAllowed -ne $true -or $bound.mainProjectMutationAllowed -or !$bound.ownedWorkerProjectOpenAllowed -or $bound.sourceSavingAllowed -or $bound.quitAllowed){throw 'EXACT_OWNED_PROJECT_SCOPE_REQUIRED'}
if($bound.experiment.mode -cne 'open-main' -or $bound.openMainAfterWitnessRequired -ne $false){throw 'EXPLICIT_EXPERIMENT_MODE_REQUIRED'}
if($bound.nonce -notmatch '^[a-f0-9]{64}$' -or $bound.runId -notmatch '^[a-f0-9-]{36}$'){throw 'FRESH_NONCE_RUN_REQUIRED'}
if([IO.Path]::GetFullPath($bound.scriptPath) -ne (Join-Path $runDir 'bootstrap.jsx') -or [IO.Path]::GetFullPath($bound.handshakePath) -ne (Join-Path $runDir 'handshake.json')){throw 'EXACT_OWNED_PATHS_REQUIRED'}
if((Hash-OwnFile (Join-Path $PSScriptRoot 'validate-result.ps1')) -cne $bound.validatorSha256 -or (Hash-OwnFile (Join-Path $PSScriptRoot 'worker-gate.ps1')) -cne $bound.gateSha256 -or (Hash-OwnFile (Join-Path $PSScriptRoot 'worker-contract.cjs')) -cne $bound.workerContractSha256 -or (Hash-OwnFile (Join-Path $PSScriptRoot 'jsx/thumbnail-worker.template.jsx')) -cne $bound.templateSha256){throw 'FROZEN_SCHEMA_ADAPTER_CHANGED'}
if($bound.workerRoot -cne (Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)) 'Contentrium\Preset\ThumbnailWorker') -or [IO.Path]::GetDirectoryName($runDir) -cne (Join-Path $bound.workerRoot 'runs') -or $bound.outputPolicy -cne 'localCache' -or $bound.observationBudgetSeconds -ne 120 -or $TimeoutSeconds -gt $bound.observationBudgetSeconds -or $bound.scriptPath.Contains('"')){throw 'OWN_STAGE_OPERATION_SCOPE_REQUIRED'}
if((Hash-OwnFile $PSCommandPath) -ne $bound.launcherSha256 -or (Hash-OwnFile $bound.scriptPath) -ne $bound.scriptSha256 -or (Hash-OwnFile (Join-Path $PSScriptRoot 'prepare.cjs')) -ne $bound.prepareSha256){throw 'FROZEN_HARNESS_CHANGED'}
. (Join-Path $PSScriptRoot 'validate-result.ps1')
. (Join-Path $PSScriptRoot 'worker-gate.ps1')
if([IO.Path]::GetFullPath($bound.requestPath) -cne (Join-Path $runDir 'request.json') -or (Hash-OwnFile $bound.requestPath) -cne $bound.requestSha256){throw 'FROZEN_JOB_REQUEST_CHANGED'}
$ownedRequest=Get-Content -LiteralPath $bound.requestPath -Encoding UTF8 -Raw|ConvertFrom-Json
if($ownedRequest.operation -cnotin @('discover','render') -or $ownedRequest.operation -cne $bound.operation -or $ownedRequest.policy -cnotin @('solid-v1','solid-rect-v1') -or $ownedRequest.cancelPath -cne (Join-Path $runDir 'cancel.token')){throw 'FIXED_WORKER_OPERATION_REQUIRED'}
if($ownedRequest.requestId -cne $bound.runId -or $ownedRequest.source.path -cne $bound.source.path -or $ownedRequest.source.sha256 -cne $bound.source.sha256 -or $ownedRequest.source.bytes -ne $bound.source.bytes){throw 'EXACT_SOURCE_REQUEST_REQUIRED'}
if([Environment]::GetEnvironmentVariable('CONTENTRIUM_SCRIPT_WORKER_NONCE','Process') -or [Environment]::GetEnvironmentVariable('CONTENTRIUM_SCRIPT_WORKER_RECEIPT','Process')){throw 'PARENT_MUST_LACK_CHILD_ONLY_ENVIRONMENT'}
if(Test-Path -LiteralPath $bound.handshakePath){throw 'NEW_HANDSHAKE_PATH_REQUIRED'}
$pins=@($bound.pins.imagePins)
if($pins.Count -ne 2 -or [IO.Path]::GetFileName($bound.pins.launchPath) -ine 'AfterFX.com'){throw 'COM_LAUNCH_TWO_IMAGE_PINS_REQUIRED'}
foreach($leaf in @('AfterFX.exe','AfterFX.com')){if(@($pins|Where-Object{[IO.Path]::GetFileName($_.path) -ieq $leaf}).Count -ne 1){throw 'EXACT_COM_EXE_PAIR_REQUIRED'}}
if(@($pins|Where-Object{$_.path -ceq $bound.pins.launchPath}).Count -ne 1){throw 'EXACT_LAUNCH_PIN_REQUIRED'}
foreach($image in $pins){if(![IO.Path]::IsPathRooted($image.path) -or [IO.Path]::GetDirectoryName($image.path) -ine [IO.Path]::GetDirectoryName($bound.pins.launchPath) -or $image.sha256 -notmatch '^[a-f0-9]{64}$' -or (Hash-OwnFile $image.path) -ne $image.sha256){throw 'PINNED_INSTALLED_IMAGE_CHANGED'}}
if(@($bound.arguments).Count -ne 5 -or $bound.arguments[0] -cne '-m' -or $bound.arguments[1] -cne '-re' -or $bound.arguments[2] -cne '-noui' -or $bound.arguments[3] -cne '-r' -or $bound.arguments[4] -cne $bound.scriptPath -or $bound.requireRenderEngineTrue -isnot [bool] -or !$bound.requireRenderEngineTrue){throw 'FIXED_COM_M_RE_NOUI_R_ONLY_ARGUMENTS_REQUIRED'}
$controllerSessionId=[Diagnostics.Process]::GetCurrentProcess().SessionId
if($bound.experiment.mode -ceq 'open-main'){
 $expectedMain=$bound.experiment.mainHost
 if($null -eq $expectedMain -or $expectedMain.processId -le 0 -or $expectedMain.sessionId -ne $controllerSessionId){throw 'BEFORE_MAIN_WITNESS_CHANGED'}
 $mainPin=@($pins|Where-Object{$_.path -ieq $expectedMain.executablePath -and $_.sha256 -ceq $expectedMain.imageSha256})
 if($mainPin.Count -ne 1){throw 'EXACT_EXPECTED_MAIN_IMAGE_PIN_REQUIRED'}
}
Assert-Caller $bound
$intentPath=Join-Path $runDir 'launch-intent.json'
if(Test-Path -LiteralPath $intentPath){throw 'ONE_INTENT_NO_REPLAY'}
$workerGate=Acquire-WorkerGate (Join-Path $bound.workerRoot 'native-worker-gate.json') $bound $ExpectedManifestSHA256
try{Write-Once $intentPath @{requestedUtc=[DateTime]::UtcNow.ToString('o');controllerPid=$PID;controllerSessionId=$controllerSessionId;manifestSha256=$ExpectedManifestSHA256;pins=$pins;arguments=@($bound.arguments);experiment=$bound.experiment;mainAfterWitnessRequired=$bound.openMainAfterWitnessRequired;changedTransportCalibration=$false;ownedSource=$bound.source;requestSha256=$bound.requestSha256;noAutomaticRetry=$true;noAutomaticFlagFallback=$true;noAutomaticQuitOrKill=$true;projectMutationAllowed=$true;mainProjectMutationAllowed=$false;ownedWorkerProjectOpenAllowed=$true;sourceSavingAllowed=$false;pngCompletionVerified=$false;quitAllowed=$false}
}catch{$workerGate.stream.Dispose();throw}
$naturalExitAndOutputQualified=$false
$child=$null;$stdoutFile=$null;$stderrFile=$null;$stdoutTask=$null;$stderrTask=$null
$stdoutPath=Join-Path $runDir 'stdout.bin';$stderrPath=Join-Path $runDir 'stderr.bin'
try{
 $sourceBefore=Assert-OwnedSource $bound.source $bound.nodeSourceWitness
 Write-Once (Join-Path $runDir 'source-before.json') $sourceBefore
 $baseline=@(Get-AEProcesses)
 Write-Once (Join-Path $runDir 'process-baseline.json') @{observedUtc=[DateTime]::UtcNow.ToString('o');controllerSessionId=$controllerSessionId;processes=$baseline}
 $null=Assert-MainSnapshot $baseline $bound.experiment $true
 $logOptions=[IO.FileOptions]::Asynchronous -bor [IO.FileOptions]::WriteThrough
 $stdoutFile=[IO.FileStream]::new($stdoutPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read,1,$logOptions)
 $stderrFile=[IO.FileStream]::new($stderrPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read,1,$logOptions)
 $startInfo=New-Object Diagnostics.ProcessStartInfo
 $startInfo.FileName=$bound.pins.launchPath
 $startInfo.Arguments='-m -re -noui -r "'+$bound.scriptPath+'"'
 $startInfo.WorkingDirectory=$runDir
 $startInfo.UseShellExecute=$false
 $startInfo.CreateNoWindow=$true
 $startInfo.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
 $startInfo.RedirectStandardOutput = $true
 $startInfo.RedirectStandardError = $true
 $startInfo.EnvironmentVariables['CONTENTRIUM_SCRIPT_WORKER_NONCE']=$bound.nonce
 $startInfo.EnvironmentVariables['CONTENTRIUM_SCRIPT_WORKER_RECEIPT']=$bound.handshakePath
 $launchUtc=[DateTime]::UtcNow;$clock=[Diagnostics.Stopwatch]::StartNew()
 $preStart=@(Get-AEProcesses)
 Write-Once (Join-Path $runDir 'process-before-start.json') @{observedUtc=[DateTime]::UtcNow.ToString('o');processes=$preStart}
 $null=Assert-MainSnapshot $preStart $bound.experiment $true
 $null=Assert-OwnedSource $bound.source $bound.nodeSourceWitness
 Assert-Caller $bound
 $child=New-Object Diagnostics.Process;$child.StartInfo=$startInfo
 if(!$child.Start()){throw 'NATIVE_START_RETURNED_FALSE_NO_RETRY'}
 $stdoutTask=$child.StandardOutput.BaseStream.CopyToAsync($stdoutFile)
 $stderrTask=$child.StandardError.BaseStream.CopyToAsync($stderrFile)
 $startUtc=$null;$startError=$null
 try{$startUtc=$child.StartTime.ToUniversalTime().ToString('o')}catch{$startError=$_.Exception.Message}
 Write-Once (Join-Path $runDir 'process-start.json') @{observedUtc=[DateTime]::UtcNow.ToString('o');launchedUtc=$launchUtc.ToString('o');direct=(Read-DirectState $child);directStartUtc=$startUtc;startReadError=$startError;controllerPid=$PID;controllerSessionId=$controllerSessionId;arguments=$startInfo.Arguments}
 $observations=@();$handshake=$null;$readError=$null;$ordinal=0;$handshakeFirstObservedUtc=$null;$lastDisposition='waiting-handshake'
 while($clock.Elapsed.TotalSeconds -lt $TimeoutSeconds){
  $observed=@()
  foreach($row in @(Get-AEProcesses)){
   $pin=@($pins|Where-Object{$_.path -ieq $row.executablePath});$digest=$null
   if($pin.Count -eq 1){$digest=Hash-OwnFile $row.executablePath}
   $observed+=[pscustomobject]@{processId=$row.processId;parentProcessId=$row.parentProcessId;sessionId=$row.sessionId;createdUtc=$row.createdUtc;executablePath=$row.executablePath;imageSha256=$digest;imagePinMatches=($pin.Count -eq 1 -and $digest -eq $pin[0].sha256)}
  }
  $sample=[pscustomobject]@{sequence=$ordinal;observedUtc=[DateTime]::UtcNow.ToString('o');direct=(Read-DirectState $child);processes=$observed}
  Write-Once (Join-Path $runDir ('process-observation-'+$ordinal.ToString('0000')+'.json')) $sample
  $observations+=$sample;$ordinal++
  $null=Assert-MainSnapshot $observed $bound.experiment $false
  if($null -eq $handshake -and (Test-Path -LiteralPath $bound.handshakePath)){try{$data=Get-Content -LiteralPath $bound.handshakePath -Encoding UTF8 -Raw|ConvertFrom-Json;$handshake=Read-ValidatedHandshake $data $bound.nonce $ownedRequest $bound.requestSha256;$handshakeFirstObservedUtc=[DateTime]::UtcNow.ToString('o')}catch{$readError=$_.Exception.Message}}
  $lastDisposition=Get-ObservationDisposition $handshake (Read-DirectState $child) ($stdoutTask.Status -eq [Threading.Tasks.TaskStatus]::RanToCompletion) ($stderrTask.Status -eq [Threading.Tasks.TaskStatus]::RanToCompletion)
  if($lastDisposition -ceq 'complete'){break}
  Start-Sleep -Milliseconds 250
 }
 Write-Once (Join-Path $runDir 'process-observations.json') @{samples=$observations;handshakeReadError=$readError;handshakeFirstObservedUtc=$handshakeFirstObservedUtc;lastDisposition=$lastDisposition;observationBudgetSeconds=$TimeoutSeconds;elapsedSeconds=$clock.Elapsed.TotalSeconds;synchronousOperationsMayExceedBudget=$true}
 $rawHandshake=$null;$handshakeSha=$null
 if(Test-Path -LiteralPath $bound.handshakePath){$rawHandshake=[IO.File]::ReadAllText($bound.handshakePath,[Text.Encoding]::UTF8);$handshakeSha=Hash-OwnFile $bound.handshakePath}
 $finalSnapshot=@(Get-AEProcesses)
 Write-Once (Join-Path $runDir 'process-after-observation.json') @{observedUtc=[DateTime]::UtcNow.ToString('o');processes=$finalSnapshot}
 $null=Assert-MainSnapshot $finalSnapshot $bound.experiment $false
 $sourceAfter=Assert-OwnedSource $bound.source $bound.nodeSourceWitness
 Write-Once (Join-Path $runDir 'source-after.json') $sourceAfter
 $renderEngineModeQualified=$null -ne $handshake -and $handshake.isRenderEngine.available -eq $true -and $handshake.isRenderEngine.value -eq $true
 $stdoutReadback=Read-Capture $stdoutPath $stdoutTask $stdoutFile
 $stderrReadback=Read-Capture $stderrPath $stderrTask $stderrFile
 $finalDirect=Read-DirectState $child
 $nonMainProcesses=@($finalSnapshot|Where-Object{$bound.experiment.mode -cne 'open-main' -or $_.processId -ne $bound.experiment.mainHost.processId})
 $nativeCleanupPending=$finalDirect.hasExited -ne $true -or $nonMainProcesses.Count -ne 0
 $naturalExitAndOutputQualified=$finalDirect.hasExited -eq $true -and $finalDirect.exitCode -eq 0 -and $stdoutReadback.copyCompleted -eq $true -and $stderrReadback.copyCompleted -eq $true -and !$nativeCleanupPending
 Write-Once (Join-Path $runDir 'readback.json') @{handshake=$handshake;rawHandshake=$rawHandshake;handshakeSha256=$handshakeSha;handshakeFirstObservedUtc=$handshakeFirstObservedUtc;sourcePrePostHashesMatch=$true;renderEngineModeQualified=$renderEngineModeQualified;naturalExitAndOutputQualified=$naturalExitAndOutputQualified;nativeCleanupPending=$nativeCleanupPending;nonMainProcesses=$nonMainProcesses;direct=$finalDirect;controllerSessionId=$controllerSessionId;experimentMode=$bound.experiment.mode;mainProcessIdentityPreserved=($bound.experiment.mode -ceq 'open-main');mainAfterWitnessRequired=$bound.openMainAfterWitnessRequired;mainProjectPreservationProven=$false;stdout=$stdoutReadback;stderr=$stderrReadback;nonceMatches=($null -ne $handshake);exactWriterPidProven=$false;workerIsolationProven=$false;projectMutationAllowed=$true;mainProjectMutationAllowed=$false;ownedWorkerProjectOpenAllowed=$true;sourceSavingAllowed=$false;pngCompletionVerified=$false;quitAllowed=$false;noAutomaticRetry=$true;noAutomaticQuitOrKill=$true}
 if($naturalExitAndOutputQualified -and $null -ne $handshake){Complete-WorkerGate $workerGate (Join-Path $runDir 'readback.json')}
 if($null -eq $handshake){throw 'TIMEOUT_OR_UNBOUND_HANDSHAKE_UNKNOWN_NO_RETRY'}
 if(!$renderEngineModeQualified){throw 'RENDER_ENGINE_MODE_FALSE_OR_UNAVAILABLE_NO_RETRY'}
 if(!$handshake.ok){throw ('OWNED_AEP_JOB_FAILED_NO_RETRY '+$handshake.error.code)}
 if(!$naturalExitAndOutputQualified){throw 'HANDSHAKE_NATIVE_LIFETIME_OR_OUTPUT_INCOMPLETE_NO_RETRY'}
 Write-Once (Join-Path $runDir 'launch-complete.json') @{observationCompleted=$true;renderEngineModeQualified=$true;naturalExitAndOutputQualified=$true;workerIsolationProven=$false;exactWriterPidProven=$false;projectMutationAllowed=$true;mainProjectMutationAllowed=$false;ownedWorkerProjectOpenAllowed=$true;sourceSavingAllowed=$false;pngCompletionVerified=$false;quitAllowed=$false}
}catch{
 $primary=$_.Exception.Message
 $sourceFailureWitness=$null;try{$sourceFailureWitness=Assert-OwnedSource $bound.source $bound.nodeSourceWitness}catch{$sourceFailureWitness=@{verificationError=$_.Exception.Message}}
 Write-Once (Join-Path $runDir 'launch-failure.json') @{message=$primary;sourceWitness=$sourceFailureWitness;direct=(Read-DirectState $child);controllerSessionId=$controllerSessionId;stdout=(Read-Capture $stdoutPath $stdoutTask $stdoutFile);stderr=(Read-Capture $stderrPath $stderrTask $stderrFile);unknownNativeState=(!$naturalExitAndOutputQualified);noReplay=$true;noAutomaticCleanup=$true;noAutomaticQuitOrKill=$true;projectMutationAllowed=$true;mainProjectMutationAllowed=$false;ownedWorkerProjectOpenAllowed=$true;sourceSavingAllowed=$false;pngCompletionVerified=$false;quitAllowed=$false}
 throw
}finally{
 if($null -ne $workerGate){try{$workerGate.stream.Dispose()}catch{}}
 if($null -ne $stdoutFile -and ($null -eq $stdoutTask -or $stdoutTask.IsCompleted)){$stdoutFile.Dispose()}
 if($null -ne $stderrFile -and ($null -eq $stderrTask -or $stderrTask.IsCompleted)){$stderrFile.Dispose()}
 if($null -ne $child -and (Read-DirectState $child).hasExited -eq $true){$child.Dispose()}
}
