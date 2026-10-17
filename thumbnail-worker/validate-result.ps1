# Pure JSON validation. No host, process, source or profile access.
function Assert-Fields($Value,[string[]]$Names){
 if($null -eq $Value -or $Value -isnot [pscustomobject]){throw 'OBJECT_REQUIRED'}
 $keys=@($Value.PSObject.Properties.Name);if($keys.Count -ne $Names.Count){throw 'EXACT_FIELDS_REQUIRED'}
 foreach($key in $Names){if($keys -cnotcontains $key){throw 'EXACT_FIELDS_REQUIRED'}}
}
function Test-JSONNumber($Value){return (($Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal]) -and ![double]::IsNaN([double]$Value) -and ![double]::IsInfinity([double]$Value))}
function Test-BoundedCount($Value,[int]$Maximum){return ((Test-JSONNumber $Value) -and $Value -ge 0 -and $Value -le $Maximum -and [Math]::Floor([double]$Value) -eq [double]$Value)}
function Test-Text($Value){return ($Value -is [string] -and $Value.Length -gt 0 -and $Value.Length -le 4096 -and $Value -cnotmatch '[\x00-\x1f]')}
function Test-JsonEquivalent($Left,$Right){
 if($null -eq $Left -or $null -eq $Right){return ($null -eq $Left -and $null -eq $Right)}
 if(Test-JSONNumber $Left){return ((Test-JSONNumber $Right) -and [double]$Left -eq [double]$Right)}
 if($Left -is [bool]){return ($Right -is [bool] -and $Left -eq $Right)}
 if($Left -is [string]){return ($Right -is [string] -and $Left -ceq $Right)}
 if($Left -is [array]){if($Right -isnot [array] -or $Left.Count -ne $Right.Count){return $false};for($i=0;$i -lt $Left.Count;$i++){if(!(Test-JsonEquivalent $Left[$i] $Right[$i])){return $false}};return $true}
 if($Left -isnot [pscustomobject] -or $Right -isnot [pscustomobject]){return $false}
 $keys=@($Left.PSObject.Properties.Name);$other=@($Right.PSObject.Properties.Name);if($keys.Count -ne $other.Count){return $false}
 foreach($key in $keys){if($other -cnotcontains $key -or !(Test-JsonEquivalent $Left.$key $Right.$key)){return $false}};return $true
}
function Assert-Manifest($Manifest,$Request){
 Assert-Fields $Manifest @('schema','policy','sourceSha256','projectEligible','reason','compositions')
 if(!(Test-BoundedCount $Manifest.schema 1) -or $Manifest.schema -ne 1 -or $Manifest.policy -cnotin @('solid-v1','solid-rect-v1') -or $Manifest.policy -cne $Request.policy -or $Manifest.sourceSha256 -cne $Request.source.sha256 -or $Manifest.projectEligible -isnot [bool] -or ($null -ne $Manifest.reason -and !(Test-Text $Manifest.reason)) -or $Manifest.compositions -isnot [array] -or $Manifest.compositions.Count -gt 32){throw 'INVALID_MANIFEST'}
 $ids=@{}
 foreach($c in $Manifest.compositions){
  Assert-Fields $c @('ordinal','name','width','height','pixelAspect','duration','frameRate','frameDuration','displayStartTime','layerCount','eligible','reason','layers','totalFrames')
  if(!(Test-BoundedCount $c.ordinal 256) -or $c.ordinal -lt 1 -or $ids.ContainsKey([string]$c.ordinal) -or !(Test-Text $c.name) -or $c.eligible -isnot [bool]){throw 'INVALID_COMP_RECORD'};$ids[[string]$c.ordinal]=$true
  if(!$c.eligible){continue}
  foreach($field in @('width','height','pixelAspect','duration','frameRate','frameDuration','displayStartTime','layerCount')){if(!(Test-JSONNumber $c.$field)){throw 'INVALID_COMP_NUMBER'}}
  if(!(Test-BoundedCount $c.width 1920) -or $c.width -lt 1 -or !(Test-BoundedCount $c.height 1920) -or $c.height -lt 1 -or $c.width*$c.height -gt 2073600 -or $c.pixelAspect -ne 1 -or $c.displayStartTime -ne 0 -or $c.duration -le 0 -or $c.frameDuration -le 0 -or $c.frameRate -le 0){throw 'INVALID_COMP_GEOMETRY_OR_TIME'}
  if(!(Test-BoundedCount $c.totalFrames 1000000) -or $c.totalFrames -lt 1){throw 'NATIVE_FRAME_COUNT_REQUIRED'}
  if($null -ne $c.reason -or !(Test-BoundedCount $c.layerCount 32) -or $c.layerCount -lt 1 -or $c.layers -isnot [array] -or $c.layers.Count -ne $c.layerCount){throw 'INVALID_LAYER_RECORD'}
  for($j=0;$j -lt $c.layers.Count;$j++){$l=$c.layers[$j];if($Manifest.policy -ceq 'solid-rect-v1' -and $l.PSObject.Properties.Name -ccontains 'kind' -and $l.kind -ceq 'rect-fill'){Assert-Fields $l @('index','name','kind','profile');if(!(Test-BoundedCount $l.index 32) -or $l.index -ne ($j+1) -or !(Test-Text $l.name) -or $l.profile -cne 'single-rect-fill-static-v1'){throw 'INVALID_RECT_RECORD'};continue};Assert-Fields $l @('index','name','width','height','color');if(!(Test-BoundedCount $l.index 32) -or $l.index -ne ($j+1) -or !(Test-Text $l.name) -or !(Test-BoundedCount $l.width 30000) -or $l.width -lt 1 -or !(Test-BoundedCount $l.height 30000) -or $l.height -lt 1 -or $l.color -isnot [array] -or $l.color.Count -ne 3){throw 'INVALID_SOLID_RECORD'};foreach($channel in $l.color){if(!(Test-JSONNumber $channel) -or $channel -lt 0 -or $channel -gt 1){throw 'INVALID_COLOR'}}}
 }
}
function Read-ValidatedHandshake($Data,[string]$ExpectedNonce,$Request,[string]$RequestSHA256){
 Assert-Fields $Data @('schema','nonce','requestId','requestSha256','operation','appVersion','isRenderEngine','ok','phase','initialState','sourcePath','sourceSha256','manifest','frames','scan','canceled','error')
 if(!(Test-BoundedCount $Data.schema 1) -or $Data.schema -ne 1 -or $Data.nonce -cne $ExpectedNonce -or $ExpectedNonce -cnotmatch '^[a-f0-9]{64}$' -or $Data.requestId -cne $Request.requestId -or $Data.requestSha256 -cne $RequestSHA256 -or $Data.operation -cne $Request.operation -or $Data.sourcePath -cne $Request.source.path -or $Data.sourceSha256 -cne $Request.source.sha256){throw 'RESULT_IDENTITY_CHANGED'}
 if($Data.ok -isnot [bool] -or $Data.canceled -isnot [bool] -or !(Test-Text $Data.appVersion) -or $Data.phase -cnotin @('preflight','opening','discovery','frame-request','settling-frame','complete')){throw 'INVALID_RESULT_STATE'}
 Assert-Fields $Data.isRenderEngine @('available','value');$flag=$Data.isRenderEngine
 if($flag.available -isnot [bool] -or ($flag.available -and $flag.value -isnot [bool]) -or (!$flag.available -and $null -ne $flag.value)){throw 'INVALID_ENGINE_FLAG'}
 if($null -ne $Data.initialState){Assert-Fields $Data.initialState @('projectPresent','state');$initial=$Data.initialState;if($initial.projectPresent -isnot [bool] -or ($initial.projectPresent -and $initial.state -cnotin @('unverified','clean-empty')) -or (!$initial.projectPresent -and $initial.state -cne 'absent')){throw 'INVALID_INITIAL_STATE'}}
 if($null -ne $Data.manifest){Assert-Manifest $Data.manifest $Request}
 $scan=$Data.scan;Assert-Fields $scan @('totalLayers','totalVisited','activeLayer','layers')
 if(!(Test-BoundedCount $scan.totalLayers 256) -or !(Test-BoundedCount $scan.totalVisited 128000) -or $scan.layers -isnot [array] -or $scan.layers.Count -ne $scan.totalLayers -or ($null -ne $scan.activeLayer -and (!(Test-BoundedCount $scan.activeLayer 255) -or $scan.activeLayer -ge $scan.layers.Count))){throw 'INVALID_SCAN'}
 $visited=0
 foreach($row in $scan.layers){
  Assert-Fields $row @('compOrdinal','layerIndex','attemptedNodes','visitedNodes','maxDepth','lastPath','completed')
  if(!(Test-BoundedCount $row.compOrdinal 256) -or $row.compOrdinal -lt 1 -or !(Test-BoundedCount $row.layerIndex 32) -or $row.layerIndex -lt 1 -or !(Test-BoundedCount $row.attemptedNodes 501) -or $row.attemptedNodes -lt 1 -or !(Test-BoundedCount $row.visitedNodes 500) -or $row.visitedNodes -gt $row.attemptedNodes -or !(Test-BoundedCount $row.maxDepth 13) -or $row.lastPath -isnot [array] -or $row.lastPath.Count -gt 13 -or $row.completed -isnot [bool]){throw 'INVALID_SCAN_ROW'}
  foreach($part in $row.lastPath){if(!(Test-BoundedCount $part 100) -or $part -lt 1){throw 'INVALID_SCAN_PATH'}};$visited+=$row.visitedNodes
 }
 if($visited -ne $scan.totalVisited){throw 'SCAN_TOTAL_CHANGED'}
 if($Data.frames -isnot [array] -or $Data.frames.Count -gt $Request.frames.Count){throw 'INVALID_FRAME_COUNT'}
 for($i=0;$i -lt $Data.frames.Count;$i++){
  $frame=$Data.frames[$i];$spec=$Request.frames[$i];Assert-Fields $frame @('ordinal','index','time','nativeTimeText','path','status','pending','settlement')
  foreach($field in @('ordinal','index')){if(!(Test-JSONNumber $frame.$field) -or [double]$frame.$field -ne [double]$spec.$field){throw 'FRAME_PLAN_CHANGED'}}
  if(!(Test-JSONNumber $frame.time) -or $frame.time -lt 0 -or $frame.time -ge $Request.selection.record.duration -or $frame.nativeTimeText -isnot [string] -or $frame.nativeTimeText -cnotmatch '^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$' -or [double]::Parse($frame.nativeTimeText,[Globalization.CultureInfo]::InvariantCulture) -ne [double]$frame.time){throw 'NATIVE_WIRE_TIME_CHANGED'}
  if($frame.path -cne $spec.outputPath -or $frame.status -cnotin @('attempted','requested') -or $frame.pending -isnot [bool] -or !$frame.pending){throw 'FRAME_PLAN_CHANGED'}
  $s=$frame.settlement;Assert-Fields $s @('state','polls','elapsedMs','lastBytes','lastReadReason','envelopeComplete','stableObservations')
  if($s.state -cnotin @('not-started','waiting','complete','timed-out','read-error','sleep-error','canceled') -or !(Test-BoundedCount $s.polls 100) -or !(Test-JSONNumber $s.elapsedMs) -or $s.elapsedMs -lt 0 -or !(Test-BoundedCount $s.lastBytes 134217728) -or !(Test-Text $s.lastReadReason) -or $s.envelopeComplete -isnot [bool] -or !(Test-BoundedCount $s.stableObservations 2)){throw 'INVALID_PNG_SETTLEMENT'}
  if($s.envelopeComplete -and ($s.state -cne 'complete' -or $s.polls -lt 2 -or $s.stableObservations -ne 2 -or $s.lastReadReason -cne 'complete-envelope' -or $s.lastBytes -lt 36 -or $s.elapsedMs -ge 5000)){throw 'INVALID_COMPLETE_ENVELOPE'}
  if($Data.ok -and ($frame.status -cne 'requested' -or !$s.envelopeComplete)){throw 'INCOMPLETE_SUCCESS_FRAME'}
 }
 if($Data.ok){
  if($null -ne $Data.error -or $Data.canceled -or $Data.phase -cne 'complete' -or $Data.appVersion -cne '26.5x89' -or !$flag.available -or !$flag.value -or $null -eq $Data.initialState -or $Data.initialState.state -ceq 'unverified' -or $null -eq $Data.manifest){throw 'INVALID_SUCCESS'}
  $expectedFrames=0;if($Request.operation -ceq 'render'){$expectedFrames=12};if($Data.frames.Count -ne $expectedFrames){throw 'INVALID_SUCCESS_FRAME_COUNT'}
  if($Request.operation -ceq 'render' -and (!$Data.manifest.projectEligible -or !(Test-JsonEquivalent $Data.manifest $Request.selection.manifest))){throw 'RENDER_MANIFEST_CHANGED'}
  if($Data.manifest.projectEligible){
   if($Data.manifest.compositions.Count -eq 0 -or @($Data.manifest.compositions|Where-Object{!$_.eligible}).Count -ne 0){throw 'ELIGIBLE_MANIFEST_INCOMPLETE'}
   $owners=@{};foreach($comp in $Data.manifest.compositions){foreach($layer in $comp.layers){$owners[([string]$comp.ordinal+':'+[string]$layer.index)]=$true}}
   if($null -ne $scan.activeLayer -or $scan.layers.Count -ne $owners.Count){throw 'SUCCESS_SCAN_INCOMPLETE'}
   foreach($row in $scan.layers){$key=[string]$row.compOrdinal+':'+[string]$row.layerIndex;if(!$owners.ContainsKey($key) -or !$row.completed -or $row.visitedNodes -lt 1 -or $row.attemptedNodes -ne $row.visitedNodes -or $row.attemptedNodes -gt 500 -or $row.maxDepth -gt 12 -or $row.lastPath.Count -gt 12){throw 'SUCCESS_SCAN_OWNER_CHANGED'};$owners.Remove($key)}
   if($owners.Count -ne 0){throw 'SUCCESS_SCAN_INCOMPLETE'}
  }
 }else{Assert-Fields $Data.error @('code','message');if(!(Test-Text $Data.error.code) -or !(Test-Text $Data.error.message) -or ($Data.canceled -and $Data.error.code -cne 'CANCELED')){throw 'INVALID_PRIMARY_ERROR'}}
 return $Data
}
