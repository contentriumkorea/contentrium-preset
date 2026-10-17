'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
test('Windows PowerShell5.1 raw handshake reader preserves a plain UTF8 string without provider metadata',{skip:process.platform!=='win32'},t=>{
 const launcher=process.env.CONTENTRIUM_RAW_HANDSHAKE_TEST_LAUNCHER||path.resolve(__dirname,'../thumbnail-worker/launch.ps1');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cp-raw-handshake-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const script=String.raw`param([Parameter(Mandatory=$true)][string]$Launcher,[Parameter(Mandatory=$true)][string]$Root)
Set-StrictMode -Version Latest;$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1){throw 'WINDOWS_POWERSHELL_51_REQUIRED'}
$text='{"own":"한글 콘텐츠리움","ok":true}'+[string][char]13+[string][char]10
$file=Join-Path $Root '한글-handshake.json';[IO.File]::WriteAllText($file,$text,[Text.UTF8Encoding]::new($true))
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($Launcher,[ref]$tokens,[ref]$errors)
if(@($errors).Count){throw 'LAUNCHER_PARSE_FAILED'}
$assignments=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left -is [Management.Automation.Language.VariableExpressionAst] -and $n.Left.VariablePath.UserPath -ceq 'rawHandshake' -and $n.Right.Extent.Text -cne '$null'},$true))
if($assignments.Count -ne 1){throw 'EXACT_RAW_HANDSHAKE_READER_REQUIRED'}
$bound=[pscustomobject]@{handshakePath=$file};$raw=Invoke-Expression $assignments[0].Right.Extent.Text
if($raw -isnot [string] -or [string]$raw -cne $text){throw 'UTF8_BOM_OR_CRLF_CHANGED'}
$notes=@($raw.PSObject.Properties.Name|Where-Object{$_ -cin @('PSPath','PSParentPath','PSChildName','PSDrive','PSProvider','ReadCount')})
if($notes.Count -ne 0){throw 'RAW_HANDSHAKE_PROVIDER_GRAPH_WOULD_BE_SERIALIZED'}
# The old decorated provider graph is NEVER sent to ConvertTo-Json by this regression.
$json=@{rawHandshake=$raw}|ConvertTo-Json -Depth 12
$decoded=$json|ConvertFrom-Json
if($decoded.rawHandshake -isnot [string] -or $decoded.rawHandshake -cne $text){throw 'RAW_HANDSHAKE_JSON_TYPE_OR_TEXT_CHANGED'}
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
@{passed=3;plainString=$true;utf8BomCrlfExact=$true;jsonStringExact=$true}|ConvertTo-Json -Compress
`;
 const file=path.join(root,'reader-only.ps1');fs.writeFileSync(file,'\ufeff'+script);
 const result=spawnSync(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-File',file,'-Launcher',launcher,'-Root',root],{windowsHide:true,shell:false,encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
 assert.ifError(result.error);assert.equal(result.status,0,result.stderr||result.stdout);
 const row=JSON.parse(result.stdout.replace(/^\ufeff/,''));assert.equal(row.passed,3);assert.equal(row.plainString,true);assert.equal(row.utf8BomCrlfExact,true);assert.equal(row.jsonStringExact,true);
});
