(function(scope){
  'use strict';
  var VERSION=1, RATE=48000, MAX_BYTES=67108864;
  function fail(code,message){var e=new Error(message);e.code=code;return e;}
  function abort(signal){if(signal&&signal.aborted){var e=fail('ABORT_ERR','미리듣기 준비를 취소했습니다.');e.name='AbortError';throw e;}}
  function number(value,min,max){return typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;}
  function id(value){return typeof value==='string'&&/^[a-z0-9_-]{1,80}$/i.test(value)&&['__proto__','constructor','prototype'].indexOf(value)===-1;}
  function basename(value){return typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._ -]*\.wav$/i.test(value)&&value.indexOf('..')===-1;}
  function normalizeRecipe(value,duration,hash){
    if(!value||!Array.isArray(value.tracks)||!value.tracks.length||value.tracks.length>32)throw fail('PREVIEW_AUDIO_RECIPE','1~32개의 소스 트랙을 명시하세요.');
    if(value.videoSha256&&value.videoSha256!==hash)throw fail('PREVIEW_AUDIO_VIDEO_CHANGED','영상이 변경되었습니다. 현재 영상에 맞춰 설정을 다시 저장하세요.');
    var tracks=value.tracks.map(function(t){
      if(!t||!basename(t.file))throw fail('PREVIEW_AUDIO_PATH','UserAudio 폴더의 WAV 파일명만 지정하세요.');
      var r={file:t.file,start:t.start,sourceStart:t.sourceStart,duration:t.duration,playbackRate:t.playbackRate,gainDb:t.gainDb,fadeIn:t.fadeIn,fadeOut:t.fadeOut};
      if(!number(r.start,0,duration)||!number(r.sourceStart,0,3600)||!number(r.duration,1/RATE,duration)||r.start+r.duration>duration+1/RATE||!number(r.playbackRate,-100,100)||Math.abs(r.playbackRate)<.01||!number(r.gainDb,-200,24)||!number(r.fadeIn,0,r.duration)||!number(r.fadeOut,0,r.duration))throw fail('PREVIEW_AUDIO_RECIPE','트랙의 시작·길이·속도·음량·페이드 범위를 확인하세요.');
      if(t.gainEnvelope!=null){
        if(!Array.isArray(t.gainEnvelope)||!t.gainEnvelope.length||t.gainEnvelope.length>20000)throw fail('PREVIEW_AUDIO_RECIPE','음량 곡선을 확인하세요.');
        var last=-1;r.gainEnvelope=t.gainEnvelope.map(function(p){if(!Array.isArray(p)||p.length!==2||!number(p[0],0,r.duration)||p[0]<=last||!Array.isArray(p[1])||p[1].length!==2||!p[1].every(function(v){return number(v,-200,24);}))throw fail('PREVIEW_AUDIO_RECIPE','음량 곡선은 시간순 스테레오 dB 값이어야 합니다.');last=p[0];return[p[0],p[1].slice()];});
      }
      return r;
    });
    return {videoSha256:hash,duration:duration,tracks:tracks};
  }
  // Uncompressed WAV decoding avoids any external encoder or installed plug-in dependency.
  function decodeWav(bytes){
    var u=bytes instanceof ArrayBuffer?new Uint8Array(bytes):new Uint8Array(bytes.buffer,bytes.byteOffset||0,bytes.byteLength),v=new DataView(u.buffer,u.byteOffset,u.byteLength);
    function bad(){throw fail('PREVIEW_AUDIO_DECODE','PCM WAV 데이터를 읽지 못했습니다. PCM 8/16/24/32비트 또는 float32 WAV를 사용하세요.');}
    function tag(at){return String.fromCharCode(u[at],u[at+1],u[at+2],u[at+3]);}
    if(u.length<44||u.length>MAX_BYTES||tag(0)!=='RIFF'||tag(8)!=='WAVE'||v.getUint32(4,true)+8>u.length)bad();
    var end=v.getUint32(4,true)+8,p=12,fmt=null,data=null;
    while(p+8<=end){var n=v.getUint32(p+4,true),start=p+8;if(start+n>end)bad();if(tag(p)==='fmt '){if(n<16)bad();fmt={type:v.getUint16(start,true),channels:v.getUint16(start+2,true),rate:v.getUint32(start+4,true),align:v.getUint16(start+12,true),bits:v.getUint16(start+14,true)};}if(tag(p)==='data')data={start:start,length:n};p=start+n+(n%2);}
    if(!fmt||!data||!data.length||fmt.channels<1||fmt.channels>2||fmt.rate<8000||fmt.rate>192000||[8,16,24,32].indexOf(fmt.bits)<0||!(fmt.type===1||fmt.type===3&&fmt.bits===32)||fmt.align!==fmt.channels*fmt.bits/8||data.length%fmt.align)bad();
    var frames=data.length/fmt.align,channels=[];for(var c=0;c<fmt.channels;c++)channels.push(new Float32Array(frames));
    for(var i=0;i<frames;i++)for(c=0;c<fmt.channels;c++){var at=data.start+i*fmt.align+c*fmt.bits/8,x;if(fmt.type===3)x=v.getFloat32(at,true);else if(fmt.bits===8)x=(v.getUint8(at)-128)/128;else if(fmt.bits===16)x=v.getInt16(at,true)/32768;else if(fmt.bits===24){x=v.getUint8(at)|(v.getUint8(at+1)<<8)|(v.getUint8(at+2)<<16);if(x&0x800000)x-=0x1000000;x/=8388608;}else x=v.getInt32(at,true)/2147483648;if(!Number.isFinite(x))bad();channels[c][i]=x;}
    return {sampleRate:fmt.rate,channels:channels,duration:frames/fmt.rate};
  }
  function encodeWav(channels){var n=channels[0].length,b=new ArrayBuffer(44+n*4),v=new DataView(b);function tag(at,s){for(var i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));}tag(0,'RIFF');v.setUint32(4,b.byteLength-8,true);tag(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,RATE,true);v.setUint32(28,RATE*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,n*4,true);for(var i=0;i<n;i++)for(var c=0;c<2;c++){var x=Math.max(-1,Math.min(1,channels[c][i]));v.setInt16(44+(i*2+c)*2,Math.round(x*(x<0?32768:32767)),true);}return new Uint8Array(b);}
  function sample(data,at,step){
    if(at<0||at>=data.length)return 0;
    if(step<=1){var i=Math.floor(at),f=at-i;return data[i]*(1-f)+(data[i+1]||0)*f;}
    // Windowed sinc low-pass prevents 96kHz and sped-up sources aliasing at 48kHz.
    var cutoff=1/step,radius=Math.ceil(8*step),center=Math.floor(at),sum=0,weight=0;
    for(var j=center-radius;j<=center+radius;j++){var d=(at-j)*cutoff;if(Math.abs(d)>=8)continue;var sinc=Math.abs(d)<1e-10?1:Math.sin(Math.PI*d)/(Math.PI*d),w=sinc*(.5+.5*Math.cos(Math.PI*d/8))*cutoff;sum+=(data[j]||0)*w;weight+=w;}
    return weight?sum/weight:0;
  }
  async function render(recipe,sources,signal){
    var n=Math.round(recipe.duration*RATE),out=[new Float32Array(n),new Float32Array(n)];
    for(var k=0;k<recipe.tracks.length;k++){
      var t=recipe.tracks[k],source=sources[t.file],env=t.gainEnvelope,ei=0,first=Math.ceil(t.start*RATE),last=Math.min(n,Math.ceil((t.start+t.duration)*RATE));
      for(var i=first;i<last;i++){
        if((i-first)%16384===0){abort(signal);await new Promise(function(resolve){setTimeout(resolve,0);});}
        var time=i/RATE-t.start,pos=(t.sourceStart+time*t.playbackRate)*source.sampleRate,fade=Math.min(1,t.fadeIn?time/t.fadeIn:1,t.fadeOut?(t.duration-time)/t.fadeOut:1);
        if(env)while(ei+1<env.length&&env[ei+1][0]<=time)ei++;
        for(var c=0;c<2;c++){var db=t.gainDb;if(env){var a=env[ei],b=env[Math.min(ei+1,env.length-1)],fraction=b[0]===a[0]?0:Math.max(0,Math.min(1,(time-a[0])/(b[0]-a[0])));db+=a[1][c]+(b[1][c]-a[1][c])*fraction;}out[c][i]+=sample(source.channels[Math.min(c,source.channels.length-1)],pos,source.sampleRate*Math.abs(t.playbackRate)/RATE)*Math.pow(10,db/20)*Math.max(0,fade);}
      }
    }
    abort(signal);return encodeWav(out);
  }
  function createPreparer(options){
    options=options||{};var req=options.nodeRequire||(typeof require==='function'?require:scope.cep_node&&scope.cep_node.require);
    if(!req)throw fail('PREVIEW_AUDIO_NODE','개인 효과음 준비는 Node가 연결된 CEP 패널에서 사용할 수 있습니다.');
    var fs=req('fs'),path=req('path'),crypto=req('crypto'),url=req('url'),BufferType=req('buffer').Buffer;
    function call(method,args){return new Promise(function(resolve,reject){fs[method].apply(fs,args.concat(function(e,v){if(e)reject(e);else resolve(v);}));});}
    function hash(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
    function rootPath(value){if(typeof value!=='string'||!value)throw fail('PREVIEW_AUDIO_PATH','개인 오디오 및 확장 폴더가 필요합니다.');if(/^file:/i.test(value))value=url.fileURLToPath(value);else if(!path.isAbsolute(value))value=decodeURIComponent(value);if(!path.isAbsolute(value))throw fail('PREVIEW_AUDIO_PATH','절대 폴더 경로가 필요합니다.');return path.resolve(value);}
    var audioRoot=rootPath(options.audioRoot),extensionRoot=rootPath(options.extensionPath),previewRoot=path.join(audioRoot,'Previews'),recipeFile=path.join(previewRoot,'sources.json'),leaseAPI=scope.ContentriumFileLease||(typeof require==='function'&&require('./ui-file-lease.js')),leases=options.leases||leaseAPI.create({root:audioRoot,nodeRequire:req});
    function inside(base,file){var relative=path.relative(base,file);if(relative==='..'||relative.indexOf('..'+path.sep)===0||path.isAbsolute(relative))throw fail('PREVIEW_AUDIO_PATH','개인 미리듣기 경로가 지정 폴더를 벗어납니다.');}
    async function realFile(file,base,max){var real=await call('realpath',[file]);inside(await call('realpath',[base]),real);var s=await call('stat',[real]);if(!s.isFile()||s.size>max)throw fail('PREVIEW_AUDIO_PATH','파일 형식 또는 크기 제한을 확인하세요.');return call('readFile',[real]);}
    async function directory(parent,name){var realParent=await call('realpath',[parent]),target=path.join(parent,name);await call('mkdir',[target,{recursive:true}]);var real=await call('realpath',[target]);inside(realParent,real);return real;}
    async function videoInfo(variant){
      if(!variant||!id(variant.id)||variant.renderedPreview!=='library/previews/'+variant.id+'.webm'&&variant.renderedPreview!=='library/previews/'+variant.id+'.mp4')throw fail('PREVIEW_AUDIO_PATH','현재 변형의 로컬 렌더 영상이 필요합니다.');
      var metadata=JSON.parse(String(await realFile(path.join(extensionRoot,'library/preview-media.json'),extensionRoot,1048576))),clip=(metadata.clips||[]).find(function(c){return c.id===variant.id&&c.path===variant.renderedPreview;});
      if(!clip||!number(clip.duration,.001,60)||!/^[a-f0-9]{64}$/.test(clip.sha256||''))throw fail('PREVIEW_AUDIO_VIDEO','검증된 영상 길이와 해시가 없습니다.');
      if(hash(await realFile(path.join(extensionRoot,variant.renderedPreview),extensionRoot,134217728))!==clip.sha256)throw fail('PREVIEW_AUDIO_VIDEO_CHANGED','렌더 영상이 변경되어 미리듣기를 준비할 수 없습니다.');return clip;
    }
    async function readManifest(){try{var data=JSON.parse(String(await realFile(recipeFile,audioRoot,4194304)));if(data.schemaVersion!==1||!data.recipes||Array.isArray(data.recipes)||typeof data.recipes!=='object'||Object.keys(data.recipes).some(function(k){return !id(k);}))throw new Error('schema');return data;}catch(e){if(e.code==='ENOENT')return{schemaVersion:1,recipes:{}};if(e.code==='PREVIEW_AUDIO_PATH')throw e;throw fail('PREVIEW_AUDIO_RECIPE','Previews/sources.json 설정을 읽지 못했습니다.');}}
    async function atomic(file,bytes){var tmp=file+'.tmp-'+crypto.randomBytes(8).toString('hex');try{await call('writeFile',[tmp,bytes,{flag:'wx'}]);await call('rename',[tmp,file]);}finally{try{await call('unlink',[tmp]);}catch(e){if(e.code!=='ENOENT')throw e;}}}
    async function saveRecipe(variant,value){
      var info=await videoInfo(variant),recipe=normalizeRecipe(value,info.duration,info.sha256);await directory(audioRoot,'Previews');var lock=path.join(previewRoot,'sources.lock'),handle;
      try{handle=await leases.acquire(lock);}catch(e){if(e.code==='LEASE_BUSY')throw fail('PREVIEW_AUDIO_BUSY',e.message);throw e;}
      try{var manifest=await readManifest();manifest.recipes[variant.id]=recipe;var serialized=JSON.stringify(manifest)+'\n';if(BufferType.byteLength(serialized)>4194304)throw fail('PREVIEW_AUDIO_RECIPE','개인 효과음 설정이 크기 제한을 초과했습니다.');await handle.assert();await atomic(recipeFile,serialized);return recipe;}finally{await handle.release();}
    }
    async function readRecipe(variant,settings){var info=await videoInfo(variant),manifest=await readManifest(),value=manifest.recipes[variant.id];if(!value)return null;if(settings&&settings.allowStale&&value.videoSha256!==info.sha256){if(!number(value.duration,.001,60)||!/^[a-f0-9]{64}$/.test(value.videoSha256||''))throw fail('PREVIEW_AUDIO_RECIPE','저장된 영상 정보를 확인하세요.');return Object.assign(normalizeRecipe(value,value.duration,value.videoSha256),{stale:true});}return normalizeRecipe(value,info.duration,info.sha256);}
    async function resolve(request){
      request=request||{};var signal=request.signal;abort(signal);var recipe=await readRecipe(request.variant);abort(signal);
      if(!recipe)return{status:'missing',reason:'recipe-missing',missing:['Previews/sources.json'],message:'선택한 변형의 효과음 소스를 먼저 연결하세요.'};
      var decoded={},sourceHashes={},names=Array.from(new Set(recipe.tracks.map(function(t){return t.file;})));
      for(var i=0;i<names.length;i++){var file=names[i],bytes;try{bytes=await realFile(path.join(audioRoot,file),audioRoot,MAX_BYTES);}catch(e){if(e.code==='ENOENT')return{status:'missing',reason:'source-missing',missing:[file],message:'개인 효과음 파일을 찾을 수 없습니다: '+file};throw e;}abort(signal);sourceHashes[file]=hash(bytes);decoded[file]=decodeWav(bytes);}
      var key=hash(JSON.stringify({version:VERSION,recipe:recipe,sources:sourceHashes})),cache=path.join(previewRoot,'Cache'),output=path.join(cache,key+'.wav'),receipt=path.join(cache,key+'.json'),cached=false;
      try{var old=JSON.parse(String(await realFile(receipt,audioRoot,1024))),existing=await realFile(output,audioRoot,MAX_BYTES);abort(signal);if(old.sha256===hash(existing)){var d=decodeWav(existing);cached=d.sampleRate===RATE&&d.channels.length===2&&d.channels[0].length===Math.round(recipe.duration*RATE);}}catch(e){if(e.code==='PREVIEW_AUDIO_PATH'||e.name==='AbortError')throw e;}
      if(!cached){var rendered=await render(recipe,decoded,signal);abort(signal);await directory(audioRoot,'Previews');await directory(previewRoot,'Cache');abort(signal);await atomic(output,BufferType.from(rendered));await atomic(receipt,JSON.stringify({sha256:hash(rendered)}));}
      abort(signal);return{status:'ready',url:url.pathToFileURL(output).href,offset:0,missing:[],videoSha256:recipe.videoSha256,duration:recipe.duration,cached:cached};
    }
    async function listSources(){var names=await call('readdir',[audioRoot]);return names.filter(basename).sort();}
    return {resolve:resolve,saveRecipe:saveRecipe,readRecipe:readRecipe,listSources:listSources,videoInfo:videoInfo};
  }
  function openRecipeDialog(variant,config){
    config=config||{};var preparer=config.preparer;if(!preparer)throw fail('PREVIEW_AUDIO_NODE','개인 효과음 폴더에 연결되지 않았습니다.');
    function el(tag,text){var n=document.createElement(tag);if(text!=null)n.textContent=text;return n;}
    var dialog=el('dialog'),heading=el('h2','미리보기 효과음 준비'),help=el('p','개인 UserAudio 폴더의 WAV를 선택하고 영상에 맞춰 배치하세요. 원본 파일은 변경하지 않습니다.'),rows=el('div'),notice=el('p','설정을 읽는 중…'),add=el('button','트랙 추가'),save=el('button','저장하고 준비'),close=el('button','닫기'),players=el('div'),fields=[],duration=0,choices=[],closed=false,controller=null;
    dialog.className='preview-audio-settings-dialog';dialog.style.cssText='width:min(820px,90vw);max-height:90vh;overflow:auto';rows.style.cssText='display:grid;gap:12px';notice.setAttribute('role','status');save.disabled=add.disabled=true;
    function stopPlayer(){players.querySelectorAll('audio').forEach(function(a){a.pause();a.removeAttribute('src');a.load();});players.textContent='';}
    function pauseAudition(){players.querySelectorAll('audio').forEach(function(a){a.pause();});}
    function visibilityChanged(){if(document.hidden)pauseAudition();}
    scope.addEventListener('blur',pauseAudition);
    document.addEventListener('visibilitychange',visibilityChanged);
    function cleanup(){if(closed)return;closed=true;scope.removeEventListener('blur',pauseAudition);document.removeEventListener('visibilitychange',visibilityChanged);if(controller)controller.abort();stopPlayer();dialog.remove();if(config.onClose)config.onClose();}
    close.onclick=function(){dialog.close();};dialog.addEventListener('close',cleanup);
    function newRow(track){
      var row=el('fieldset'),legend=el('legend','효과음 트랙'),select=el('select'),form={},envelope=track&&track.gainEnvelope;row.appendChild(legend);row.style.cssText='display:flex;gap:8px;flex-wrap:wrap';select.setAttribute('aria-label','소스 WAV');
      var blank=el('option','소스 선택');blank.value='';select.appendChild(blank);choices.forEach(function(name){var o=el('option',name);o.value=name;select.appendChild(o);});
      if(track&&choices.indexOf(track.file)<0){var missing=el('option',track.file+' (파일 없음)');missing.value=track.file;select.appendChild(missing);}select.value=track?track.file:'';row.appendChild(select);
      var defaults={start:0,sourceStart:0,duration:duration,playbackRate:1,gainDb:0,fadeIn:0,fadeOut:.05};
      [['start','영상 시작(초)'],['sourceStart','원본 시작(초)'],['duration','길이(초)'],['playbackRate','재생 속도'],['gainDb','음량(dB)'],['fadeIn','페이드 인(초)'],['fadeOut','페이드 아웃(초)']].forEach(function(pair){var label=el('label',pair[1]),input=el('input');label.style.cssText='display:flex;flex-direction:column;gap:3px';input.type='number';input.step='any';input.style.width='90px';input.setAttribute('aria-label',pair[1]);input.value=String(track?track[pair[0]]:defaults[pair[0]]);form[pair[0]]=input;label.appendChild(input);row.appendChild(label);});
      if(envelope){var curve=el('button','저장된 음량 곡선 해제');curve.onclick=function(){envelope=null;curve.remove();};row.appendChild(curve);}
      var remove=el('button','트랙 삭제'),field={row:row,read:function(){var value={file:select.value};Object.keys(form).forEach(function(k){value[k]=form[k].value.trim()===''?NaN:Number(form[k].value);});if(envelope)value.gainEnvelope=envelope;return value;}};
      remove.onclick=function(){fields=fields.filter(function(f){return f!==field;});row.remove();};row.appendChild(remove);rows.appendChild(row);fields.push(field);
    }
    add.onclick=function(){newRow(null);};save.onclick=async function(){
      save.disabled=add.disabled=true;stopPlayer();controller=new AbortController();notice.textContent='효과음을 준비하는 중…';
      try{await preparer.saveRecipe(variant,{tracks:fields.map(function(f){return f.read();})});var result=await preparer.resolve({variant:variant,signal:controller.signal});if(closed)return;if(result.status!=='ready'){notice.textContent=result.message||'효과음을 준비하지 못했습니다.';return;}notice.textContent='미리듣기 준비 완료 · '+result.duration.toFixed(3)+'초';var player=el('audio');player.controls=true;player.src=result.url;player.style.width='100%';player.onerror=function(){notice.textContent='준비한 효과음을 재생하지 못했습니다.';};players.appendChild(player);if(config.onPrepared)config.onPrepared(result);}
      catch(e){if(!closed)notice.textContent=e.message||String(e);}finally{if(!closed){save.disabled=add.disabled=false;}}
    };
    dialog.append(heading,help,rows,notice,players,add,save,close);document.body.appendChild(dialog);dialog.showModal();
    Promise.all([preparer.videoInfo(variant),preparer.readRecipe(variant,{allowStale:true}),preparer.listSources()]).then(function(values){if(closed)return;duration=values[0].duration;choices=values[2];if(values[1])values[1].tracks.forEach(newRow);else newRow(null);notice.textContent=(values[1]&&values[1].stale?'영상이 변경되었습니다. 배치를 확인하고 다시 저장하세요. ':'')+'영상 길이 '+duration.toFixed(3)+'초 · 사용 가능한 WAV '+choices.length+'개';save.disabled=add.disabled=false;}).catch(function(e){if(!closed)notice.textContent=e.message||String(e);});
    return {close:function(){if(!closed)dialog.close();}};
  }
  var api={createPreparer:createPreparer,decodeWav:decodeWav,normalizeRecipe:normalizeRecipe,render:render,openRecipeDialog:openRecipeDialog};scope.ContentriumPreviewAudioPreparer=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
