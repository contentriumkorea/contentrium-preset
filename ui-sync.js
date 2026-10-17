(function (scope) {
  'use strict';
  var EVENT='com.contentrium.preset.sync.v1', STATE_KEY='contentrium-preset.sync-state.v1', MAX_BYTES=131072;
  var slots=['main','edit','alt2','alt3','alt4','easing','keyframes','anchor','shifter'], colors=['red','orange','yellow','green','blue','purple'];
  var settingsKeys=['pausePreviewWhenInactive','presetMotionBlurEnabled','insertPrecompAfterInTransition','copyUserLibFootageNextToProject','presetPseudoEnabled'];
  function extensionId(slot) { return slot==='main'?'com.contentrium.preset':'com.contentrium.preset.'+slot; }
  function own(id) { return slots.some(function (slot) { return extensionId(slot)===id; }); }
  function plain(value) { return !!value && typeof value==='object' && !Array.isArray(value); }
  function exact(value,keys) { return plain(value) && Object.keys(value).sort().join('|')===keys.slice().sort().join('|'); }
  function token(value) { return typeof value==='string' && /^[A-Za-z0-9_-]{12,120}$/.test(value); }
  function integer(value) { return Number.isSafeInteger(value) && value>=0; }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function shared(value) {
    return exact(value,['favorites','labels']) && Array.isArray(value.favorites) && value.favorites.length<=2048 &&
      value.favorites.every(function (id) { return typeof id==='string' && id.length>0 && id.length<=256 && !/[\x00-\x1f]/.test(id); }) &&
      new Set(value.favorites).size===value.favorites.length && plain(value.labels) && Object.keys(value.labels).length<=2048 &&
      Object.keys(value.labels).every(function (key) { return /^(item|category):/.test(key) && key.length<=512 && colors.indexOf(value.labels[key])!==-1; });
  }
  function settings(value) { return plain(value) && Object.keys(value).length>0 && Object.keys(value).every(function (key) { return settingsKeys.indexOf(key)!==-1 && typeof value[key]==='boolean'; }); }
  function stamp(value) { return exact(value,['at','seq','origin']) && integer(value.at) && integer(value.seq) && token(value.origin); }
  function record(value,kind) { return exact(value,['value','stamp']) && stamp(value.stamp) && (kind==='shared'?shared(value.value):settings(value.value)); }
  function compare(a,b) { return a.at-b.at || a.seq-b.seq || (a.origin===b.origin?0:a.origin>b.origin?1:-1); }
  function signature(value) {
    if (!value) return '';
    if (shared(value)) return JSON.stringify([value.favorites.slice().sort(),Object.keys(value.labels).sort().map(function(k){return[k,value.labels[k]];})]);
    return JSON.stringify(Object.keys(value).sort().map(function(k){return[k,value[k]];}));
  }
  function utf8Length(text) { var count=0; for(var i=0;i<text.length;i++){var c=text.charCodeAt(i);if(c<128)count++;else if(c<2048)count+=2;else if(c>=55296&&c<=56319){var low=text.charCodeAt(++i);if(!(low>=56320&&low<=57343))return Infinity;count+=4;}else if(c>=56320&&c<=57343)return Infinity;else count+=3;}return count; }
  function eventValue(data) {
    try {
      if(typeof data!=='string'){
        // CEP may parse event.data before invoking listeners. Accept only JSON
        // data, then apply exactly the same byte limit and envelope validation.
        var seen=new Set(),nodes=0;
        function jsonValue(value,depth){
          if(++nodes>16384||depth>16)return false;
          if(value===null||typeof value==='boolean'||typeof value==='string')return true;
          if(typeof value==='number')return Number.isFinite(value);
          if(typeof value!=='object'||seen.has(value))return false;
          var array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
          if(!array&&prototype!==Object.prototype&&prototype!==null)return false;
          if(Object.getOwnPropertySymbols(value).length)return false;
          var keys=Object.keys(value),names=Object.getOwnPropertyNames(value);
          if(names.length!==keys.length+(array?1:0)||array&&keys.length!==value.length)return false;
          seen.add(value);
          var valid=keys.every(function(key){var descriptor=Object.getOwnPropertyDescriptor(value,key);return descriptor&&Object.prototype.hasOwnProperty.call(descriptor,'value')&&jsonValue(descriptor.value,depth+1);});
          seen.delete(value);return valid;
        }
        if(!plain(data)||!jsonValue(data,0))return null;
        data=JSON.stringify(data);
      }
      return utf8Length(data)<=MAX_BYTES?JSON.parse(data):null;
    }catch(ignore){return null;}
  }
  function create(config) {
    var cep=config.cep,slot=config.slot,origin=config.origin,now=config.now||Date.now,storage=config.storage,
      id=extensionId(slot),available=false,started=false,closed=false,sequence=0,seen=new Map(),
      sharedRecord=null,settingsRecord=null,ownLease=null,reservations={};
    if(slots.indexOf(slot)===-1||!token(origin))throw Error('Invalid panel sync identity');
    try { available=!!cep && typeof cep.dispatchEvent==='function' && typeof cep.addEventListener==='function' && typeof cep.removeEventListener==='function' &&
      typeof cep.getExtensionId==='function' && cep.getExtensionId()===id &&
      typeof cep.getHostEnvironment==='function' && JSON.parse(cep.getHostEnvironment()).appId==='AEFT'; } catch(ignore){}
    try { var saved=JSON.parse(storage.getItem(STATE_KEY)||'null');if(exact(saved,['v','shared','settings'])&&saved.v===1){if(record(saved.shared,'shared'))sharedRecord=saved.shared;if(record(saved.settings,'settings'))settingsRecord=saved.settings;} }catch(ignoreSaved){}
    if(!sharedRecord && shared(config.initialShared))sharedRecord={value:copy(config.initialShared),stamp:{at:0,seq:0,origin:origin}};
    if(!settingsRecord && settings(config.initialSettings))settingsRecord={value:copy(config.initialSettings),stamp:{at:0,seq:0,origin:origin}};
    function persist() { try { storage.setItem(STATE_KEY,JSON.stringify({v:1,shared:sharedRecord,settings:settingsRecord})); } catch(error) { if(config.onError)config.onError(error); } }
    function send(kind,payload,target) {
      if(!available||!started||closed)return;
      var data=JSON.stringify({v:1,sender:id,origin:origin,seq:++sequence,sentAt:now(),target:target||null,kind:kind,payload:payload});
      if(utf8Length(data)>MAX_BYTES){if(config.onError)config.onError(Error('패널 공유 데이터가 너무 큽니다.'));return;}
      try { cep.dispatchEvent({type:EVENT,scope:'APPLICATION',appId:'AEFT',extensionId:id,data:data}); } catch(error) { if(config.onError)config.onError(error); }
    }
    function leaseValid(value,sender,sourceOrigin) {
      return exact(value,['slot','token','at','opening']) && slots.indexOf(value.slot)!==-1 && integer(value.at) && now()-value.at>=-1000 && now()-value.at<3500 &&
        (value.opening===true ? /^alt[234]$/.test(value.slot) && value.token==='opening-'+sourceOrigin :
          value.opening===false && extensionId(value.slot)===sender && value.token===sourceOrigin);
    }
    function writeLease(value,remove) {
      var key='contentrium-preset.panel-lease.'+value.slot;
      try {
        var existing=JSON.parse(storage.getItem(key)||'null');
        if(remove){if(!existing||existing.token!==value.token)return;storage.removeItem(key);}
        else {
          if(existing&&existing.at>value.at)return;
          if(value.opening&&existing&&typeof existing.token==='string'&&existing.token.indexOf('opening-')!==0&&integer(existing.at)&&now()-existing.at>=0&&now()-existing.at<3500)return;
          storage.setItem(key,JSON.stringify({token:value.token,at:value.at}));
        }
        if(value.slot==='edit'){
          if(remove)storage.removeItem('contentrium-preset.edit-panel-open');
          else storage.setItem('contentrium-preset.edit-panel-open',String(value.at));
        }
        if(config.onLease)config.onLease();
      }catch(error){if(config.onError)config.onError(error);}
    }
    function acceptRecord(next,kind) {
      var prior=kind==='shared'?sharedRecord:settingsRecord;
      if(prior&&compare(next.stamp,prior.stamp)<=0)return;
      var changed=!prior||signature(prior.value)!==signature(next.value);
      if(kind==='shared')sharedRecord=copy(next);else settingsRecord=copy(next);
      persist();
      if(changed){var fn=kind==='shared'?config.onShared:config.onSettings;if(fn)fn(copy(next.value));}
    }
    function sendSnapshot(target) {
      send('snapshot',{lease:ownLease&&leaseValid(ownLease,id,origin)?ownLease:null,reservations:Object.keys(reservations).map(function(k){return reservations[k];}).filter(function(r){return leaseValid(r,id,origin);}),shared:sharedRecord,settings:settingsRecord},target);
    }
    function newerThan(local,remote) { return !!local && (!remote || compare(local.stamp,remote.stamp)>0); }
    function receive(event) {
      if(closed||!event||event.type!==EVENT||event.scope!=='APPLICATION'||event.appId!=='AEFT')return;
      var value=eventValue(event.data);
      if(!exact(value,['v','sender','origin','seq','sentAt','target','kind','payload'])||value.v!==1||!own(value.sender)||!token(value.origin)||value.origin===origin||
        !integer(value.seq)||value.seq<1||!integer(value.sentAt)||now()-value.sentAt< -1000||now()-value.sentAt>5000||
        (value.target!==null&&value.target!==origin)||(event.extensionId&&event.extensionId!==value.sender))return;
      var p=value.payload,valid=false;
      if(value.kind==='hello')valid=value.target===null&&exact(p,[]);
      else if(value.kind==='thumbnailCancel')valid=value.target===null&&exact(p,[]);
      else if(value.kind==='lease'||value.kind==='release')valid=value.target===null&&leaseValid(p,value.sender,value.origin);
      else if(value.kind==='dock')valid=value.target===null&&exact(p,['slot'])&&p.slot==='edit';
      else if(value.kind==='shared'||value.kind==='settings')valid=value.target===null&&record(p,value.kind)&&p.stamp.origin===value.origin&&p.stamp.at<=now()+1000;
      else if(value.kind==='snapshot')valid=value.target===origin&&exact(p,['lease','reservations','shared','settings'])&&
        (p.lease===null||leaseValid(p.lease,value.sender,value.origin))&&Array.isArray(p.reservations)&&p.reservations.length<=3&&
        p.reservations.every(function(r){return !!r&&r.opening===true&&leaseValid(r,value.sender,value.origin);})&&
        new Set(p.reservations.map(function(r){return r.slot;})).size===p.reservations.length&&
        (p.shared===null||record(p.shared,'shared'))&&(p.settings===null||record(p.settings,'settings'))&&
        (!p.shared||p.shared.stamp.at<=now()+1000)&&(!p.settings||p.settings.stamp.at<=now()+1000);
      if(!valid)return;
      var last=seen.get(value.origin);if(last&&(last.sender!==value.sender||last.seq>=value.seq))return;
      seen.set(value.origin,{sender:value.sender,seq:value.seq});if(seen.size>256)seen.delete(seen.keys().next().value);
      if(value.kind==='hello')sendSnapshot(value.origin);
      else if(value.kind==='thumbnailCancel'){if(config.onThumbnailCancel)config.onThumbnailCancel();}
      else if(value.kind==='lease'||value.kind==='release')writeLease(p,value.kind==='release');
      else if(value.kind==='shared'||value.kind==='settings')acceptRecord(p,value.kind);
      else if(value.kind==='snapshot'){
        if(p.lease)writeLease(p.lease,false);p.reservations.forEach(function(r){writeLease(r,false);});
        if(p.shared)acceptRecord(p.shared,'shared');if(p.settings)acceptRecord(p.settings,'settings');
        // A legacy-bearing newcomer may be newer than an already-open unset
        // peer. Backfill only a strictly newer record; equal snapshots stop.
        if(newerThan(sharedRecord,p.shared)||newerThan(settingsRecord,p.settings))sendSnapshot(value.origin);
      }
      else if(value.kind==='dock'&&slot==='edit'&&config.onDock)config.onDock();
    }
    function publish(value,kind) {
      if(closed||!(kind==='shared'?shared(value):settings(value)))return false;
      var prior=kind==='shared'?sharedRecord:settingsRecord;
      if(prior&&signature(prior.value)===signature(value))return false;
      var next={value:copy(value),stamp:{at:Math.max(now(),prior?prior.stamp.at:0),seq:prior?prior.stamp.seq+1:1,origin:origin}};
      if(kind==='shared')sharedRecord=next;else settingsRecord=next;
      persist();send(kind,next);return true;
    }
    function lease() {
      if(closed)return;
      ownLease={slot:slot,token:origin,at:now(),opening:false};writeLease(ownLease,false);send('lease',ownLease);
    }
    function release() { var value=ownLease;if(!value)return;value={slot:slot,token:origin,at:now(),opening:false};writeLease(value,true);send('release',value);ownLease=null; }
    return {available:available,start:function(){if(started||closed)return;started=true;if(available)cep.addEventListener(EVENT,receive);send('hello',{});},
      lease:lease,release:release,shared:function(value){return publish(value,'shared');},settings:function(value){return publish(value,'settings');},
      reserve:function(target){if(closed||!/^alt[234]$/.test(target))return;var value={slot:target,token:'opening-'+origin,at:now(),opening:true};reservations[target]=value;writeLease(value,false);send('lease',value);},
      releaseReservation:function(target){if(closed||!/^alt[234]$/.test(target))return;delete reservations[target];var value={slot:target,token:'opening-'+origin,at:now(),opening:true};writeLease(value,true);send('release',value);},
      dock:function(){send('dock',{slot:'edit'});},announce:function(){send('hello',{});},thumbnailCancel:function(){send('thumbnailCancel',{});},
      dispose:function(){if(closed)return;closed=true;if(available&&started)cep.removeEventListener(EVENT,receive);},
      currentShared:function(){return sharedRecord&&copy(sharedRecord.value);}};
  }
  var api={EVENT:EVENT,STATE_KEY:STATE_KEY,MAX_BYTES:MAX_BYTES,create:create,extensionId:extensionId,validShared:shared,validSettings:settings};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  scope.ContentriumSync=api;
})(typeof window==='undefined'?globalThis:window);
