/* Owned vector glyph adapter. The caller owns Undo and context/revision guards. */
(function () {
    var prefix = 'cpAnimatedFont|', sourcePrefix = 'cpAnimatedFontSource|', serial = 0, resolver = null, readScope = null;
    var clocks = ['RootElapsed','InSpan','OutSpan','TotalDuration','ParentFrameDuration','InDelay','OutDelay','InEnabled','OutEnabled','InReverse','OutReverse'];
    var visual = ['size','tracking','verticalStagger','characterRotation','skew','color'];
    var timingControls = ['duration','inEnabled','inSpeed','inDelay','inReverse','outEnabled','outSpeed','outDelay','outReverse'];
    var nativeTimeAllowance = 1/32768+1e-9, capacitySlack = 1e-9;
    function fail(code, message) { var e = new Error(message); e.code = code; throw e; }
    function own(o,k) { return Object.prototype.hasOwnProperty.call(o,k); }
    function array(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
    function finite(v) { return typeof v === 'number' && isFinite(v); }
    function quote(s) { return '"'+String(s).replace(/[\\"\x00-\x1f]/g,function(c){var m={'"':'\\"','\\':'\\\\','\n':'\\n','\r':'\\r','\t':'\\t'};return m[c]||'\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);})+'"'; }
    function json(v) { var a=[],i,k;if(v===null||v===undefined)return 'null';if(typeof v==='string')return quote(v);if(typeof v==='number'||typeof v==='boolean')return String(v);if(array(v)){for(i=0;i<v.length;i++)a.push(json(v[i]));return '['+a.join(',')+']';}for(k in v)if(own(v,k)&&typeof v[k]!=='function')a.push(quote(k)+':'+json(v[k]));return '{'+a.join(',')+'}'; }
    function parse(s) { if(!$.cpJson)fail('JSON_ENGINE_REQUIRED','Load json-engine before glyph metadata.');return $.cpJson.parse(s); }
    function copy(v) { return parse(json(v)); }
    function equal(a,b) { if(finite(a)&&finite(b))return Math.abs(a-b)<1e-10;return json(a)===json(b); }
    function hash(v) { var s=json(v),h=5381,i;for(i=0;i<s.length;i++)h=((h*33)^s.charCodeAt(i))>>>0;return String(h); }
    function invalidateReadScope() { if(readScope){readScope.valid=false;readScope.metadata=[];readScope.graphs=[];} }
    function activeReadScope() {
        if(!readScope||!readScope.valid)return null;
        try{if(typeof isValid==='function'&&isValid(readScope.project)!==true){invalidateReadScope();return null;}if(app.project!==readScope.project||!finite(app.project.revision)||app.project.revision!==readScope.revision){invalidateReadScope();return null;}}catch(invalid){invalidateReadScope();return null;}
        return readScope;
    }
    // Synchronous reads only. Never retain native objects across callback exit.
    function withReadSnapshot(callback) {
        if(typeof callback!=='function')fail('GLYPH_READ_CALLBACK','A synchronous read callback is required.');
        if(readScope){try{return callback();}catch(nestedError){invalidateReadScope();throw nestedError;}}
        var project=app.project,revision=null;try{revision=project.revision;}catch(unavailable){}
        readScope={project:project,revision:revision,valid:finite(revision),metadata:[],graphs:[]};
        try{return callback();}finally{invalidateReadScope();readScope=null;}
    }
    function scopeRecord(rows,root,comment) { var i,compId=root.containingComp&&root.containingComp.id;for(i=0;i<rows.length;i++)if(rows[i].rootId===root.id&&rows[i].compId===compId&&rows[i].comment===comment)return rows[i];return null; }
    function metadataRead(root,comment) { var lines=comment.split(/\r?\n/),found=null,i;for(i=0;i<lines.length;i++)if(lines[i].indexOf(prefix)===0){if(found)fail('GLYPH_GRAPH_CHANGED','Duplicate glyph metadata.');found=parse(lines[i].slice(prefix.length));}if(found&&(found.schemaVersion!==1||found.kind!=='animated-font'||!found.instanceId))fail('GLYPH_GRAPH_CHANGED','Invalid glyph metadata.');return found; }
    function metadata(root) { var scope=activeReadScope(),comment=String(root&&root.comment||''),record=scope?scopeRecord(scope.metadata,root,comment):null;if(record)return record.value;var value=metadataRead(root,comment);if(scope&&activeReadScope()===scope)scope.metadata.push({rootId:root.id,compId:root.containingComp&&root.containingComp.id,comment:comment,value:value});return value; }
    function save(root,m) { var lines=String(root.comment||'').split(/\r?\n/),out=[],i;for(i=0;i<lines.length;i++)if(lines[i].indexOf(prefix)!==0)out.push(lines[i]);root.comment=prefix+json(m)+(out.length?'\n'+out.join('\n'):''); }
    function member(c) { for(var i=1;i<=app.project.numItems;i++)if(app.project.item(i)===c)return true;return false; }
    function layer(c,id) { for(var i=1;i<=c.numLayers;i++)if(c.layer(i).id===id)return c.layer(i);fail('GLYPH_GRAPH_CHANGED','An owned glyph layer is missing.'); }
    function usage(c) { var n=0,i,j,p;for(i=1;i<=app.project.numItems;i++){p=app.project.item(i);if(p instanceof CompItem)for(j=1;j<=p.numLayers;j++)if(p.layer(j).source===c)n++;}return n; }
    function fx(l,i) { var p=l.property('ADBE Effect Parade').property(i);if(!p)fail('GLYPH_BINDING_CHANGED','An owned input is missing.');return p.property(1); }
    function property(l,path) { var p=l;for(var i=0;i<path.length;i++){p=p.property(path[i]);if(!p)fail('GLYPH_GRAPH_CHANGED','An owned native property is missing.');}return p; }
    function addEffect(l,name,type,value) { var p=l.property('ADBE Effect Parade').addProperty(type);p.name=name;var i=p.propertyIndex;fx(l,i).setValue(value);return i; }
    function packFor(ref) { if(!resolver)fail('GLYPH_PACK_UNAVAILABLE','This authored pack is unavailable.');var p=resolver(copy(ref));if(!p||p.id!==ref.id||p.digest!==ref.digest)fail('GLYPH_PACK_UNAVAILABLE','The exact authored pack is unavailable.');return $.cpGlyphModel.validatePack(p); }
    function configure(options) { invalidateReadScope();resolver=options&&typeof options.resolvePack==='function'?options.resolvePack:null; }
    function request(c,t,mode) { return {mode:mode,atTime:t.atTime,totalDuration:c.duration,inSpeed:c.inSpeed,outSpeed:c.outSpeed,inDelay:c.inDelay,outDelay:c.outDelay,inReverse:c.inReverse,outReverse:c.outReverse,inEnabled:c.inEnabled,outEnabled:c.outEnabled,frameDuration:t.frameDuration,inPoint:t.inPoint,outPoint:t.outPoint,inMarker:t.inMarker,outMarker:t.outMarker}; }
    function limits(t,start) { var a=[t.inPoint,t.inMarker,t.outMarker,t.outPoint,start],i;for(i=0;i<a.length;i++)if(!finite(a[i])||a[i]<-10800||a[i]>10800)fail('INVALID_GLYPH_TIMING','Timeline exceeds AE layer time limits.');if(t.inPoint<start||t.outPoint-start<=0||t.outPoint-start>10800)fail('GLYPH_SOURCE_COVERAGE','Normal source time must stay inside the owned source coverage.'); }
    function frameCapacity(required,frameDuration) {
        if(!finite(required)||required<=0||required>10800||!finite(frameDuration)||frameDuration<=0)
            fail('GLYPH_SOURCE_COVERAGE','Owned source capacity cannot be represented.');
        var capacity=Math.ceil(required/frameDuration)*frameDuration;
        if(capacity<required)capacity+=frameDuration;
        if(!finite(capacity)||capacity>10800)fail('GLYPH_SOURCE_COVERAGE','Outward source frame capacity exceeds AE duration limits.');
        return capacity;
    }
    function verifyCapacity(source,expected,required) {
        var actual=source.duration;
        if(!finite(actual)||actual<=0||actual>10800||Math.abs(actual-expected)>capacitySlack||actual+capacitySlack<required)
            fail('GLYPH_SOURCE_COVERAGE','AE did not preserve the allocated source frame capacity.');
        return actual;
    }
    function plannedCapacity(source,required) {
        if(required<=source.duration+capacitySlack)return source.duration;
        return frameCapacity(required,source.frameDuration);
    }
    function innerOutTarget(capacity) {
        /* Pad only owned inner coverage by the observed storage allowance.
           No universal native time grid is assumed. Root/marker inputs stay verbatim. */
        var target=Math.min(10800,capacity+nativeTimeAllowance);
        if(target<capacity)fail('GLYPH_SOURCE_COVERAGE','Inner source coverage exceeds AE layer time limits.');
        return target;
    }
    function coverActualSourceInterval(source,required) {
        var capacity=plannedCapacity(source,required),extended=capacity>source.duration,i,l;
        if(extended){source.duration=capacity;verifyCapacity(source,capacity,required);}
        if(source.duration+capacitySlack<required)fail('GLYPH_SOURCE_COVERAGE','Actual root source interval exceeds owned capacity.');
        for(i=1;i<=source.numLayers;i++){
            l=source.layer(i);
            if(extended&&l.outPoint+capacitySlack<source.duration)l.outPoint=innerOutTarget(source.duration);
            if(l.outPoint+capacitySlack<source.duration)fail('GLYPH_SOURCE_COVERAGE','AE did not preserve inner source coverage.');
        }
    }
    function timingReadback(root,requested,startTime,actualTiming) {
        var wanted={startTime:startTime,inPoint:requested.inPoint,inMarker:requested.inMarker,outMarker:requested.outMarker,outPoint:requested.outPoint};
        var actual={startTime:root.startTime,inPoint:root.inPoint,inMarker:actualTiming.inMarker,outMarker:actualTiming.outMarker,outPoint:root.outPoint};
        var k,maxError=0,receipt,error;
        for(k in wanted)if(own(wanted,k))maxError=Math.max(maxError,Math.abs(actual[k]-wanted[k]));
        receipt={requested:wanted,actual:actual,tolerance:nativeTimeAllowance,maxError:maxError};
        if(!finite(maxError)||maxError>nativeTimeAllowance){
            error=new Error('AE changed requested timeline seconds beyond the bounded native storage allowance.');
            error.code='GLYPH_NATIVE_READBACK';error.timingReadback=receipt;throw error;
        }
        return receipt;
    }
    function nativeMarkerClearance(root,id,wanted) {
        var marker=root.property('ADBE Marker'),existing=$.cpTimeline.read(root,id),i,j,k,p,unchanged;
        for(i=0;i<wanted.length;i++){
            unchanged=false;
            for(j=0;j<existing.length;j++)if(existing[j].role===wanted[i].role&&equal(existing[j].time,wanted[i].time))unchanged=true;
            if(unchanged)continue;
            for(k=1;k<=marker.numKeys;k++){
                try{p=marker.keyValue(k).getParameters();}catch(ignore){p={};}
                if(p.cpTimeline==='1'&&p.cpInstanceId===id&&(p.cpRole==='in'||p.cpRole==='out'))continue;
                if(Math.abs(marker.keyTime(k)-wanted[i].time)<=nativeTimeAllowance+1e-7)
                    fail('MARKER_TIME_CONFLICT','A foreign marker is too close to the requested time for safe native storage.');
            }
        }
    }
    function markerFacts(value,parameters) {
        var names=['comment','duration','label','protectedRegion','chapter','url','frameTarget','cuePointName','eventCuePoint'];
        var facts={fields:[],parameters:[]},keys=[],i,k,v;
        for(i=0;i<names.length;i++){v=value[names[i]];facts.fields.push([names[i],typeof v,copy(v)]);}
        for(k in parameters)if(own(parameters,k))keys.push(k);
        keys.sort();
        for(i=0;i<keys.length;i++){k=keys[i];v=parameters[k];facts.parameters.push([k,typeof v,copy(v)]);}
        return facts;
    }
    function markerSnapshot(root,id) {
        var p=root.property('ADBE Marker'),rows=[],i,value,parameters;
        for(i=1;i<=p.numKeys;i++){
            value=p.keyValue(i);parameters=value.getParameters();
            rows.push({time:p.keyTime(i),value:value,facts:markerFacts(value,parameters),
                owned:parameters.cpTimeline==='1'&&parameters.cpInstanceId===id&&(parameters.cpRole==='in'||parameters.cpRole==='out')});
        }
        return rows;
    }
    function foreignMarkersPreserved(root,id,before) {
        var after=markerSnapshot(root,id),original=[],current=[],i;
        for(i=0;i<before.length;i++)if(!before[i].owned)original.push({time:before[i].time,facts:before[i].facts});
        for(i=0;i<after.length;i++)if(!after[i].owned)current.push({time:after[i].time,facts:after[i].facts});
        return json(original)===json(current);
    }
    function ownedMarkersChanged(root,id,wanted) {
        var current=$.cpTimeline.read(root,id),i,j,found;
        for(i=0;i<wanted.length;i++){
            found=false;
            for(j=0;j<current.length;j++)if(current[j].role===wanted[i].role&&current[j].time===wanted[i].time&&current[j].enabled===wanted[i].enabled)found=true;
            if(!found)return true;
        }
        return false;
    }
    function glyphMarkerPlan(root,id,wanted) {
        var current=$.cpTimeline.read(root,id),pending=[],ordered=[],i,j,old,blocked,progress;
        for(i=0;i<wanted.length;i++){
            old=null;for(j=0;j<current.length;j++)if(current[j].role===wanted[i].role)old=current[j];
            if(!old||old.time!==wanted[i].time||old.enabled!==wanted[i].enabled)pending.push({spec:wanted[i],old:old});
        }
        /* Vacate another role's old location before using it. A valid IN/OUT pair
           cannot swap order; reject any unresolved collision before writing. */
        while(pending.length){
            progress=false;
            for(i=0;i<pending.length;i++){
                blocked=false;
                for(j=0;j<current.length;j++)if(current[j].role!==pending[i].spec.role&&
                    Math.abs(current[j].time-pending[i].spec.time)<=nativeTimeAllowance+1e-7)blocked=true;
                if(blocked)continue;
                ordered.push(pending[i]);
                for(j=current.length-1;j>=0;j--)if(current[j].role===pending[i].spec.role)current.splice(j,1);
                current.push({role:pending[i].spec.role,time:pending[i].spec.time});
                pending.splice(i,1);progress=true;break;
            }
            if(!progress)fail('MARKER_TIME_CONFLICT','Owned marker destinations are too close for safe relocation.');
        }
        return ordered;
    }
    function glyphMarkerValue(previous,spec,id,variantId) {
        var value=new MarkerValue(spec.comment||''),fields=['duration','label','protectedRegion','chapter','url','frameTarget','cuePointName','eventCuePoint'],i,parameters=previous?previous.getParameters():{};
        for(i=0;i<fields.length;i++)if(previous&&previous[fields[i]]!==undefined)value[fields[i]]=previous[fields[i]];
        parameters.cpTimeline='1';parameters.cpInstanceId=id;parameters.cpRole=spec.role;parameters.cpVariantId=variantId;parameters.cpScope='layer';parameters.cpEnabled=spec.enabled===false?'0':'1';
        value.setParameters(parameters);return value;
    }
    function updateGlyphMarkers(root,id,wanted,variantId) {
        var plan=glyphMarkerPlan(root,id,wanted),p=root.property('ADBE Marker'),i,j,rows,old,value,kept,best;
        for(i=0;i<plan.length;i++){
            rows=$.cpTimeline.read(root,id);old=null;
            for(j=0;j<rows.length;j++)if(rows[j].role===plan[i].spec.role)old=rows[j];
            value=glyphMarkerValue(old?p.keyValue(old.index):null,plan[i].spec,id,variantId);
            if(old&&old.time===plan[i].spec.time){p.setValueAtKey(old.index,value);continue;}
            /* The replacement exists before the old key is removed: marker-derived
               Essential Properties must never observe an absent existing role. */
            p.setValueAtTime(plan[i].spec.time,value);
            rows=$.cpTimeline.read(root,id);kept=null;best=Infinity;
            for(j=0;j<rows.length;j++)if(rows[j].role===plan[i].spec.role&&(!old||rows[j].time!==old.time)){kept=rows[j];best=Math.abs(rows[j].time-plan[i].spec.time);}
            if(!kept)for(j=0;j<rows.length;j++)if(rows[j].role===plan[i].spec.role){kept=rows[j];best=Math.abs(rows[j].time-plan[i].spec.time);}
            if(!kept||best>nativeTimeAllowance)fail('GLYPH_NATIVE_READBACK','AE changed the requested marker time beyond the native storage allowance.');
            for(j=rows.length-1;j>=0;j--)if(rows[j].role===plan[i].spec.role&&rows[j].index!==kept.index)p.removeKey(rows[j].index);
        }
    }
    function restoreMarkerSnapshot(root,rows) {
        var p=root.property('ADBE Marker'),i;
        for(i=p.numKeys;i>=1;i--)p.removeKey(i);
        for(i=0;i<rows.length;i++)p.setValueAtTime(rows[i].time,rows[i].value);
    }
    /* Observed AE Slider storage bounds; skew additionally feeds the native vector transform.
       Color's normalized domain belongs to pack schema v1, rather than the native HDR bounds. */
    function storedBounds(c) { var ks=['size','tracking','verticalStagger','characterRotation','skew','inDelay','outDelay'],i;for(i=0;i<ks.length;i++)if(c[ks[i]]<-1000000||c[ks[i]]>1000000)fail('CONTROL_VALUE','Value exceeds native Slider storage limits.');if(c.skew<-85||c.skew>85)fail('CONTROL_VALUE','Native vector skew must be between -85 and 85 degrees.'); }
    function preflight(comp,options) { options=options||{};if(!(comp instanceof CompItem)||!member(comp))fail('GLYPH_COMP_REQUIRED','Choose a live composition.');var p=packFor({id:options.fontId,digest:options.fontHash}),l=$.cpGlyphModel.layout(p,options.text,options.controls),t=$.cpGlyphModel.resolveTiming(p,l,request(l.controls,{atTime:options.atTime===undefined?comp.time:options.atTime,frameDuration:options.frameDuration===undefined?comp.frameDuration:options.frameDuration},'create'));storedBounds(l.controls);limits(t,t.inPoint);frameCapacity(Math.max(p.clock.duration,t.outPoint-t.inPoint),comp.frameDuration);return {pack:p,layout:l,timing:t,controls:copy(l.controls),text:options.text}; }
    function markerCode(id) { return 'function cpM(role){var z=null;for(var i=1;i<=thisLayer.marker.numKeys;i++){var m=thisLayer.marker.key(i),p=m.parameters;if(p&&p.cpTimeline==="1"&&p.cpInstanceId==='+quote(id)+'&&p.cpRole===role)z=m;}if(!z)throw Error("GLYPH_MARKER_MISSING");return z;}\n'; }
    function rootExpression(m,name) { var code=markerCode(m.instanceId),direct={RootElapsed:'time-thisLayer.inPoint',InSpan:'cpM("in").time-thisLayer.inPoint',OutSpan:'thisLayer.outPoint-cpM("out").time',TotalDuration:'thisLayer.outPoint-thisLayer.inPoint',ParentFrameDuration:'thisComp.frameDuration',InEnabled:'cpM("in").parameters.cpEnabled==="0"?0:1',OutEnabled:'cpM("out").parameters.cpEnabled==="0"?0:1'},key=name.charAt(0).toLowerCase()+name.slice(1),row;
        if(own(direct,name))return code+direct[name]+';';if(name.indexOf('Offset_')===0)key='offset:'+name.slice(7);row=m.rootInputs[key];if(!row)fail('GLYPH_BINDING_CHANGED','Unknown owned input.');return 'thisLayer.effect('+row.index+')(1);'; }
    function readInput(m,key) { var r=m.channels[key];if(!r)fail('GLYPH_BINDING_CHANGED','Clock input is missing.');return 'parent.effect('+r.index+')(1)'; }
    function clockExpression(m,index,count) { var g=function(k){return readInput(m,k);},e=m.header.clock.entryEnd,b=m.header.clock.bodyEnd,d=m.header.clock.duration;
        return 'var t='+g('RootElapsed')+',a='+g('InSpan')+',z='+g('TotalDuration')+'-'+g('OutSpan')+',D='+g('TotalDuration')+',fd='+g('ParentFrameDuration')+',di='+g('InDelay')+',do_='+g('OutDelay')+',onI='+g('InEnabled')+'>0.5,onO='+g('OutEnabled')+'>0.5,ri='+g('InReverse')+'>0.5,ro='+g('OutReverse')+'>0.5;\n'+
        'var E='+e+',B='+(b-e)+',X='+(d-b)+',end='+d+',rank='+index+',n='+count+',ir=ri?n-1-rank:rank,orr=ro?n-1-rank:rank,ip=a-(n-1)*di,op=D-z-(n-1)*do_,is=ir*di,ie=is+ip,os=z+orr*do_,oe=os+op,s=E,q,w,bs,be;\n'+
        'if(!(fd>0&&ip>0&&op>0))throw Error("INVALID_GLYPH_TIMING");\n'+
        'if(onI&&t<is)s=ri?end:0;else if(onI&&t<ie){q=(t-is)/ip;s=ri?end-q*X:q*E;}else if(onO&&t>=os){if(t>=oe)s=ro?0:end;else{q=(t-os)/op;s=ro?E*(1-q):'+b+'+q*X;}}else{bs=onI?ie:a;be=onO?os:z;w=be-bs;if(w>0&&t>=bs&&t<be){q=(t-bs)/w*Math.max(1,Math.floor(w/B+1e-9));if(Math.abs(q-Math.round(q))<1e-12)q=Math.round(q);s=E+(q-Math.floor(q))*B;}}\n'; }
    function expression(m,l,path,text) { property(l,path).expression=text;m.expressions.push({layerId:l.id,path:path,expression:text}); }
    function shapePath(l,index) { return ['ADBE Root Vectors Group',1,'ADBE Vectors Group',index,'ADBE Vector Shape']; }
    function geometry(p) { var out={closed:p.closed,vertices:[],inTangents:[],outTangents:[]},fields=['vertices','inTangents','outTangents'],i,j;for(i=0;i<fields.length;i++)for(j=0;j<p[fields[i]].length;j++)out[fields[i]].push([p[fields[i]][j][0],p[fields[i]][j][1]]);return out; }
    function keys(p) { var a=[],i,k;for(i=1;i<=p.numKeys;i++){k=geometry(p.keyValue(i));k.time=p.keyTime(i);a.push(k);}return a; }
    function pathClockFailure() { fail('GLYPH_PATH_TIME_CHANGED','Owned authored/native path time mapping is missing or changed.'); }
    function pathTimes(row,p,duration) {
        var a=row.authoredTimes,n=row.nativeTimes,i;
        if(!array(a)||!array(n)||a.length<2||a.length!==n.length||a.length!==p.numKeys)
            pathClockFailure();
        if(a[0]!==0||a[a.length-1]!==duration||row.timeMapHash!==hash([a,n]))pathClockFailure();
        // Compare the exact number representation persisted by json/hash/expression. AE String
        // can round native doubles during metadata serialization; this is not a drift allowance.
        for(i=0;i<a.length;i++){
            if(!finite(a[i])||!finite(n[i])||(i>0&&(a[i]<=a[i-1]||n[i]<=n[i-1]))||
                Math.abs(a[i]-n[i])>nativeTimeAllowance||String(n[i])!==String(p.keyTime(i+1)))pathClockFailure();
        }
    }
    function mappedPathExpression(m,row,dat) {
        return clockExpression(m,row.glyphIndex,m.layout.glyphs.length)+
            'var cpA='+json(row.authoredTimes)+',cpN='+json(row.nativeTimes)+',cpT=cpN[0],cpK,cpQ;\n'+
            'if(s>=cpA[cpA.length-1])cpT=cpN[cpN.length-1];else if(s>cpA[0]){for(cpK=1;cpK<cpA.length;cpK++){if(s<=cpA[cpK]){cpQ=(s-cpA[cpK-1])/(cpA[cpK]-cpA[cpK-1]);cpT=cpN[cpK-1]+cpQ*(cpN[cpK]-cpN[cpK-1]);break;}}}\n'+
            'thisComp.layer('+dat.index+').content(1).content('+(row.pathIndex+1)+').path.valueAtTime(cpT);';
    }
    function pathMappingVersion(m,source) {
        var mapped=m.pathTimeVersion===1,i,j,row,dat,consumer,p,count=0,seen={},key,expected,record,found;
        if(!array(m.paths)||(m.pathTimeVersion!==undefined&&!mapped))pathClockFailure();
        for(i=0;i<m.paths.length;i++){
            row=m.paths[i];
            if(!row||typeof row!=='object')pathClockFailure();
            if(!mapped){
                if(own(row,'authoredTimes')||own(row,'nativeTimes')||own(row,'timeMapHash'))pathClockFailure();
                continue;
            }
            dat=layer(source,row.layerId);p=property(dat,row.path);
            pathTimes(row,p,m.header.clock.duration);
            if(!finite(row.glyphIndex)||row.glyphIndex%1!==0||row.glyphIndex<0||row.glyphIndex>=m.layout.glyphs.length||
                !finite(row.pathIndex)||row.pathIndex%1!==0||row.pathIndex<0||
                dat.comment!==prefix+m.instanceId+'|data|'+row.glyphIndex||
                row.codePoint!==m.layout.glyphs[row.glyphIndex].codePoint||json(row.path)!==json(shapePath(dat,row.pathIndex+1)))pathClockFailure();
            consumer=layer(source,row.consumerLayerId);
            if(consumer.comment!==prefix+m.instanceId+'|consumer|'+row.glyphIndex)pathClockFailure();
            key=String(row.layerId)+':'+row.pathIndex;if(own(seen,key))pathClockFailure();seen[key]=true;
            expected=mappedPathExpression(m,row,dat);
            if(property(consumer,shapePath(consumer,row.pathIndex+1)).expression!==expected)pathClockFailure();
            found=0;
            for(j=0;j<m.expressions.length;j++){
                record=m.expressions[j];
                if(record.layerId===consumer.id&&json(record.path)===json(shapePath(consumer,row.pathIndex+1))){
                    if(record.expression!==expected)pathClockFailure();found++;
                }
            }
            if(found!==1)pathClockFailure();
        }
        if(mapped){
            for(i=1;i<=source.numLayers;i++){
                dat=source.layer(i);
                if(dat.comment.indexOf(prefix+m.instanceId+'|data|')===0){
                    p=property(dat,['ADBE Root Vectors Group',1,'ADBE Vectors Group']);
                    for(j=0;j<p.numProperties;j++)if(!own(seen,String(dat.id)+':'+j))pathClockFailure();
                    count+=p.numProperties;
                }
            }
            if(count!==m.paths.length)pathClockFailure();
        }
        return !mapped;
    }
    function renderFlags(l) {
        return {threeDLayer:!!l.threeDLayer,adjustmentLayer:!!l.adjustmentLayer,
            blendingMode:String(l.blendingMode),collapseTransformation:!!l.collapseTransformation,
            motionBlur:!!l.motionBlur,guideLayer:!!l.guideLayer,
            preserveTransparency:!!l.preserveTransparency,solo:!!l.solo};
    }
    function maskCount(l) { var p=l.property('ADBE Mask Parade');return p?p.numProperties:0; }
    function records(c,id) {
        var a=[],i,l,v;
        for(i=1;i<=c.numLayers;i++){
            l=c.layer(i);v=l.id===id?null:l.property('ADBE Root Vectors Group');
            a.push({id:l.id,index:i,comment:String(l.comment),parentId:l.parent?l.parent.id:null,
                enabled:l.enabled,flags:renderFlags(l),effectCount:l.property('ADBE Effect Parade').numProperties,maskCount:maskCount(l),
                vectorCount:v?v.numProperties:0,
                contentCount:v&&v.numProperties?property(l,['ADBE Root Vectors Group',1,'ADBE Vectors Group']).numProperties:0});
        }
        return a;
    }
    function rememberStatic(m,l,path) {
        var p=property(l,path);
        if(p.canSetExpression&&p.expression)return;
        if(p.numKeys)fail('GLYPH_GRAPH_CHANGED','Unexpected animation on an owned static rendering property.');
        m.staticProperties.push({layerId:l.id,path:path,value:copy(p.value)});
    }
    function rememberRendering(m,source) {
        var transforms=['ADBE Anchor Point','ADBE Position','ADBE Scale','ADBE Rotate Z','ADBE Opacity'];
        var vectors=['ADBE Vector Anchor','ADBE Vector Position','ADBE Vector Scale','ADBE Vector Rotation','ADBE Vector Skew','ADBE Vector Skew Axis','ADBE Vector Group Opacity'];
        var i,j,l,content,last;
        m.staticProperties=[];
        m.sourceRendering={width:source.width,height:source.height,pixelAspect:source.pixelAspect,frameRate:source.frameRate};
        for(i=1;i<=source.numLayers;i++){
            l=source.layer(i);
            for(j=0;j<transforms.length;j++)rememberStatic(m,l,['ADBE Transform Group',transforms[j]]);
            if(l.id===m.controllerId)continue;
            for(j=0;j<vectors.length;j++)rememberStatic(m,l,['ADBE Root Vectors Group',1,'ADBE Vector Transform Group',vectors[j]]);
            if(l.comment.indexOf('|consumer|')>=0){
                content=property(l,['ADBE Root Vectors Group',1,'ADBE Vectors Group']);last=content.numProperties;
                rememberStatic(m,l,['ADBE Root Vectors Group',1,'ADBE Vectors Group',last,'ADBE Vector Fill Opacity']);
                rememberStatic(m,l,['ADBE Root Vectors Group',1,'ADBE Vectors Group',last,'ADBE Vector Fill Rule']);
            }
        }
    }
    function validateRendering(m,source) {
        var dims={width:source.width,height:source.height,pixelAspect:source.pixelAspect,frameRate:source.frameRate};
        var i,row,p;
        if(!m.staticProperties||json(dims)!==json(m.sourceRendering))fail('GLYPH_GRAPH_CHANGED','Owned source rendering dimensions changed.');
        for(i=0;i<m.staticProperties.length;i++){
            row=m.staticProperties[i];p=property(layer(source,row.layerId),row.path);
            if(p.numKeys||(p.canSetExpression&&p.expression)||json(p.value)!==json(row.value))
                fail('GLYPH_GRAPH_CHANGED','An owned static rendering property changed.');
        }
    }
    function specs(t) { return [{role:'in',time:t.inMarker,comment:'IN',enabled:t.inEnabled},{role:'out',time:t.outMarker,comment:'OUT',enabled:t.outEnabled}]; }
    function apply(comp,plan) { var p=$.cpGlyphModel.validatePack(plan.pack),l=$.cpGlyphModel.layout(p,plan.text,plan.controls),t=$.cpGlyphModel.resolveTiming(p,l,request(l.controls,plan.timing,'read')),id='glyph-'+new Date().getTime()+'-'+(++serial),source=null,root=null,controller,m,i,j,k,r,dat,consumer,group,paths,pathProp,sh,ex,name,value,type,rootKey,idx;
        invalidateReadScope();
        if(!(comp instanceof CompItem)||!member(comp))fail('GLYPH_COMP_REQUIRED','Choose a live composition.');storedBounds(l.controls);limits(t,t.inPoint);m={schemaVersion:1,kind:'animated-font',instanceId:id,name:p.name,pack:{id:p.id,digest:p.digest},text:plan.text,timelineVersion:1,pathTimeVersion:1,controls:copy(l.controls),defaults:copy(l.controls),header:copy(p),layout:copy(l),channels:{},rootInputs:{},expressions:[],paths:[],layers:[],sourceId:null,controllerId:null};
        var used={},durableGlyphs=[];for(i=0;i<l.glyphs.length;i++)used[String(l.glyphs[i].codePoint)]=true;if(plan.text.indexOf(' ')>=0)used['32']=true;for(i=0;i<m.header.glyphs.length;i++)if(own(used,String(m.header.glyphs[i].codePoint))){m.header.glyphs[i].paths=[];durableGlyphs.push(m.header.glyphs[i]);}m.header.glyphs=durableGlyphs;
        var requiredCapacity=Math.max(p.clock.duration,t.outPoint-t.inPoint);
        var initialCapacity=frameCapacity(requiredCapacity,comp.frameDuration),actual,readback;
        try {
            source=app.project.items.addComp('Contentrium Glyphs',comp.width,comp.height,comp.pixelAspect||1,initialCapacity,comp.frameRate);source.comment=sourcePrefix+id;m.sourceId=source.id;
            verifyCapacity(source,frameCapacity(requiredCapacity,source.frameDuration),requiredCapacity);
            controller=source.layers.addShape();controller.name='Glyph Controller';controller.comment=prefix+id+'|controller|';controller.outPoint=innerOutTarget(source.duration);m.controllerId=controller.id;
            var clockDefaults={RootElapsed:0,InSpan:t.inSpan,OutSpan:t.outSpan,TotalDuration:t.outPoint-t.inPoint,ParentFrameDuration:t.frameDuration,InDelay:t.inDelay,OutDelay:t.outDelay,InEnabled:t.inEnabled?1:0,OutEnabled:t.outEnabled?1:0,InReverse:t.inReverse?1:0,OutReverse:t.outReverse?1:0};
            for(i=0;i<clocks.length+visual.length+l.glyphs.length;i++) { if(i<clocks.length){name=clocks[i];value=clockDefaults[name];type='ADBE Slider Control';}else if(i<clocks.length+visual.length){name=visual[i-clocks.length];value=l.controls[name];type=name==='color'?'ADBE Color Control':'ADBE Slider Control';if(name==='color')value=value.concat([1]);}else{r=l.glyphs[i-clocks.length-visual.length];name='Offset_'+r.textIndex;value=r.offset;type='ADBE Point Control';}
                idx=addEffect(controller,'cpAF '+name,type,value);m.channels[name]={index:idx,type:type};
            }
            for(i=0;i<l.glyphs.length;i++) { r=l.glyphs[i];for(j=0;j<p.glyphs.length;j++)if(p.glyphs[j].codePoint===r.codePoint)paths=p.glyphs[j].paths;
                dat=source.layers.addShape();dat.name='Authored Glyph '+r.textIndex;dat.comment=prefix+id+'|data|'+i;dat.enabled=false;dat.outPoint=innerOutTarget(source.duration);dat.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
                consumer=source.layers.addShape();consumer.name='Glyph '+r.textIndex;consumer.comment=prefix+id+'|consumer|'+i;consumer.parent=controller;consumer.outPoint=innerOutTarget(source.duration);consumer.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
                for(j=0;j<paths.length;j++) { property(dat,['ADBE Root Vectors Group',1,'ADBE Vectors Group']).addProperty('ADBE Vector Shape - Group');property(consumer,['ADBE Root Vectors Group',1,'ADBE Vectors Group']).addProperty('ADBE Vector Shape - Group');pathProp=property(dat,shapePath(dat,j+1));
                    var authoredTimes=[],nativeTimes=[],pathRow,nativeTime;
                    for(k=0;k<paths[j].keys.length;k++){
                        sh=new Shape();sh.closed=paths[j].closed;sh.vertices=copy(paths[j].keys[k].vertices);
                        sh.inTangents=copy(paths[j].keys[k].inTangents);sh.outTangents=copy(paths[j].keys[k].outTangents);
                        authoredTimes.push(paths[j].keys[k].time);pathProp.setValueAtTime(paths[j].keys[k].time,sh);
                        // Native keys sort automatically. Capture this write's association before
                        // a later insertion can hide a collision or exchange two authored shapes.
                        if(pathProp.numKeys!==k+1)pathClockFailure();
                        nativeTime=pathProp.keyTime(k+1);
                        if(!finite(nativeTime)||(k>0&&nativeTime<=nativeTimes[k-1])||
                            Math.abs(nativeTime-paths[j].keys[k].time)>nativeTimeAllowance)pathClockFailure();
                        nativeTimes.push(nativeTime);
                    }
                    pathRow={layerId:dat.id,consumerLayerId:consumer.id,glyphIndex:i,path:shapePath(dat,j+1),
                        hash:hash(keys(pathProp)),codePoint:r.codePoint,pathIndex:j,
                        authoredTimes:authoredTimes,nativeTimes:nativeTimes,timeMapHash:hash([authoredTimes,nativeTimes])};
                    pathTimes(pathRow,pathProp,p.clock.duration);
                    for(k=1;k<=pathProp.numKeys;k++)pathProp.setInterpolationTypeAtKey(k,KeyframeInterpolationType.LINEAR,KeyframeInterpolationType.LINEAR);
                    m.paths.push(pathRow);
                }
                property(consumer,['ADBE Root Vectors Group',1,'ADBE Vectors Group']).addProperty('ADBE Vector Graphic - Fill');
                expression(m,consumer,['ADBE Root Vectors Group',1,'ADBE Vectors Group',paths.length+1,'ADBE Vector Fill Color'],readInput(m,'color')+';');
                var advance=r.x-l.controls.tracking*(r.textIndex-(scalarCount(m.text)-1)/2);
                expression(m,consumer,['ADBE Transform Group','ADBE Anchor Point'],'[0,0];');
                expression(m,consumer,['ADBE Transform Group','ADBE Position'],'var o='+readInput(m,'Offset_'+r.textIndex)+',tr='+readInput(m,'tracking')+',vs='+readInput(m,'verticalStagger')+';['+advance+'+tr*'+(r.textIndex-(scalarCount(m.text)-1)/2)+'+o[0],o[1]+'+i+'*vs];');
                expression(m,consumer,['ADBE Root Vectors Group',1,'ADBE Vector Transform Group','ADBE Vector Rotation'],readInput(m,'characterRotation')+';');
                expression(m,consumer,['ADBE Root Vectors Group',1,'ADBE Vector Transform Group','ADBE Vector Skew'],readInput(m,'skew')+';');
            }
            /* All layers now exist: indexed data references remain stable and are validated. */
            for(i=0;i<l.glyphs.length;i++){dat=null;consumer=null;for(j=1;j<=source.numLayers;j++){r=source.layer(j);if(r.comment===prefix+id+'|data|'+i)dat=r;if(r.comment===prefix+id+'|consumer|'+i)consumer=r;}for(j=0;j<m.paths.length;j++)if(m.paths[j].layerId===dat.id)expression(m,consumer,shapePath(consumer,m.paths[j].pathIndex+1),mappedPathExpression(m,m.paths[j],dat));}
            expression(m,controller,['ADBE Transform Group','ADBE Anchor Point'],'[0,0];');
            expression(m,controller,['ADBE Transform Group','ADBE Position'],'[thisComp.width/2,thisComp.height/2];');
            expression(m,controller,['ADBE Transform Group','ADBE Scale'],'var s=effect('+m.channels.size.index+')(1)/'+p.metrics.em+'*100;[s,s];');
            source.motionGraphicsTemplateName='Contentrium owned glyph inputs';
            for(name in m.channels)if(own(m.channels,name)){pathProp=fx(controller,m.channels[name].index);if(!pathProp.canAddToMotionGraphicsTemplate(source)||!pathProp.addToMotionGraphicsTemplateAs(source,'cpAF '+name))fail('GLYPH_EP_UNAVAILABLE','AE cannot expose an owned glyph input.');}
            root=comp.layers.add(source);root.name=p.name;if(root.startTime!==t.inPoint)root.startTime=t.inPoint;if(root.inPoint!==t.inPoint)root.inPoint=t.inPoint;if(root.outPoint!==t.outPoint)root.outPoint=t.outPoint;m.rootLayerId=root.id;
            coverActualSourceInterval(source,root.outPoint-root.startTime);
            var rootKeys=['inDelay','outDelay','inReverse','outReverse'].concat(visual);for(i=0;i<l.glyphs.length;i++)rootKeys.push('offset:'+l.glyphs[i].textIndex);
            for(i=0;i<rootKeys.length;i++){
                rootKey=rootKeys[i];
                if(rootKey==='color')type='ADBE Color Control';
                else if(rootKey.indexOf('offset:')===0)type='ADBE Point Control';
                else if(rootKey.indexOf('Reverse')>=0)type='ADBE Checkbox Control';
                else type='ADBE Slider Control';
                value=rootKey.indexOf('offset:')===0?l.controls.offsets[rootKey.slice(7)]:l.controls[rootKey];
                if(rootKey==='color')value=value.concat([1]);
                if(typeof value==='boolean')value=value?1:0;
                idx=addEffect(root,'cpAF '+rootKey,type,value);
                m.rootInputs[rootKey]={index:idx,type:type};
            }
            $.cpTimeline.ensure(root,id,specs(t),{scope:'layer',variantId:p.id});
            for(name in m.channels)if(own(m.channels,name)){pathProp=findEP(root,m,name,controller);pathProp.expression=rootExpression(m,name);}
            m.layers=records(source,controller.id);rememberRendering(m,source);save(root,m);actual=graph(root,false,false);
            readback=timingReadback(root,t,t.inPoint,actual.timing);
            return {instanceId:id,rootLayerId:root.id,sourceId:source.id,kind:'animated-font',timingReadback:readback};
        } catch(error) { try { if(root)root.remove();if(source&&member(source))source.remove(); }catch(rollback){error.rollbackError=String(rollback.message||rollback);}throw error; }
    }
    function scalarCount(s) { var n=0,i;for(i=0;i<s.length;i++){if(s.charCodeAt(i)>=55296&&s.charCodeAt(i)<=56319)i++;n++;}return n; }
    function locator(p) { var d,pieces=[],i,q,owner;if(!p||!finite(p.propertyDepth)||p.propertyDepth<1||p.propertyDepth>16||typeof p.propertyGroup!=='function')fail('GLYPH_BINDING_CHANGED','Native property ancestry is unavailable.');d=p.propertyDepth;owner=p.propertyGroup(d);if(!owner||!owner.containingComp||!finite(owner.id)||!finite(owner.containingComp.id))fail('GLYPH_BINDING_CHANGED','Source property owner is unavailable.');for(i=0;i<d;i++){q=i?p.propertyGroup(i):p;if(!q||!finite(q.propertyIndex)||typeof q.matchName!=='string'||!q.matchName)fail('GLYPH_BINDING_CHANGED','Source property ancestry changed.');pieces.push([q.propertyIndex,q.matchName]);}return {compId:owner.containingComp.id,layerId:owner.id,path:pieces}; }
    function findEP(root,m,name,controller) { var group=root.essentialProperty,p,found=null,count=0,i,expected=locator(fx(controller,m.channels[name].index));if(expected.compId!==m.sourceId||expected.layerId!==m.controllerId)fail('GLYPH_BINDING_CHANGED','Owned controller identity changed.');if(!group)fail('GLYPH_BINDING_CHANGED','Essential Properties are missing.');for(i=1;i<=group.numProperties;i++){p=group.property(i);if(p.name==='cpAF '+name){count++;if(json(locator(p.essentialPropertySource))===json(expected))found=p;}}if(count!==1||!found)fail('GLYPH_BINDING_CHANGED','Essential Property name/source binding changed.');return found; }
    function nativePack(m,source) {
        var p=copy(m.header),i,j,row,k,path,keyIndex;
        for(i=0;i<m.paths.length;i++){
            row=m.paths[i];path=property(layer(source,row.layerId),row.path);
            if(path.expression||hash(keys(path))!==row.hash)fail('GLYPH_GRAPH_CHANGED','Authored glyph geometry changed.');
            for(keyIndex=1;keyIndex<=path.numKeys;keyIndex++){
                if(String(path.keyInInterpolationType(keyIndex))!==String(KeyframeInterpolationType.LINEAR)||
                    String(path.keyOutInterpolationType(keyIndex))!==String(KeyframeInterpolationType.LINEAR))
                    fail('GLYPH_GRAPH_CHANGED','Authored glyph path interpolation must remain linear.');
            }
            for(j=0;j<p.glyphs.length;j++){
                if(p.glyphs[j].codePoint===row.codePoint&&!p.glyphs[j].paths[row.pathIndex]){
                    k=keys(path);if(m.pathTimeVersion===1)for(keyIndex=0;keyIndex<k.length;keyIndex++)k[keyIndex].time=row.authoredTimes[keyIndex];p.glyphs[j].paths[row.pathIndex]={closed:path.keyValue(1).closed,keys:k};
                }
            }
        }
        return $.cpGlyphModel.validatePack(p);
    }
    function validateRootExpression(root,m,name,p,markersPresent) {
        var expected=rootExpression(m,name);
        if(p.expression!==expected||!p.expressionEnabled)fail('GLYPH_BINDING_CHANGED','Root Essential Property expression changed.');
        if(markersPresent&&p.expressionError){
            /* AE can retain the missing-marker error after explicit Reset has
               recreated that marker. Reevaluate only an intact enabled binding. */
            try{p.valueAtTime(root.containingComp.time,false);}catch(error){fail('GLYPH_BINDING_CHANGED','Root Essential Property evaluation failed: '+String(error.message||error));}
            if(p.expression!==expected||!p.expressionEnabled||p.expressionError)fail('GLYPH_BINDING_CHANGED','Root Essential Property expression changed.');
        }
    }
    function graph(root,write,missing) {
        if(write)invalidateReadScope();var scope=!write&&!missing?activeReadScope():null,comment=String(root&&root.comment||''),record=scope?scopeRecord(scope.graphs,root,comment):null;
        if(record)return record.value;var value=inspectGraph(root,write,missing);
        if(scope&&activeReadScope()===scope)scope.graphs.push({rootId:root.id,compId:root.containingComp&&root.containingComp.id,comment:comment,value:value});return value;
    }
    function inspectGraph(root,write,missing) { var m=metadata(root),s,c,i,row,l,p,name,values,pack,layout,t,marks,ins=null,outs=null,unavailable=null,legacy;
        if(!m)fail('GLYPH_REQUIRED','Choose an owned animated-font instance.');if(write&&root.locked)fail('LAYER_LOCKED','Unlock the glyph root.');s=root.source;if(!(s instanceof CompItem)||!member(s)||s.id!==m.sourceId||String(s.comment)!==sourcePrefix+m.instanceId)fail('GLYPH_GRAPH_CHANGED','Owned glyph source is missing or changed.');if(root.timeRemapEnabled||root.stretch!==100)fail('GLYPH_CLOCK_CHANGED','Glyph roots require ordinary 100% source-time playback.');if(write&&usage(s)!==1)fail('GLYPH_SOURCE_SHARED','The owned source has additional references; editing is disabled.');
        marks=$.cpTimeline.read(root,m.instanceId);for(i=0;i<marks.length;i++){if(marks[i].role==='in'){if(ins)fail('GLYPH_MARKER_MISSING','Duplicate IN marker.');ins=marks[i];}if(marks[i].role==='out'){if(outs)fail('GLYPH_MARKER_MISSING','Duplicate OUT marker.');outs=marks[i];}}
        if((!ins||!outs)&&!missing)fail('GLYPH_MARKER_MISSING','An owned marker is missing; use explicit Reset.');
        if(s.numLayers!==m.layers.length)fail('GLYPH_GRAPH_CHANGED','Owned source layer count changed.');
        c=layer(s,m.controllerId);
        for(i=0;i<m.layers.length;i++){
            row=m.layers[i];l=layer(s,row.id);
            if(l.index!==row.index||String(l.comment)!==row.comment||(l.parent?l.parent.id:null)!==row.parentId||
                l.enabled!==row.enabled||(write&&l.locked)||l.startTime!==0||l.inPoint!==0||
                l.stretch!==100||l.timeRemapEnabled)
                fail('GLYPH_GRAPH_CHANGED','Owned glyph layer linkage changed.');
            if(json(renderFlags(l))!==json(row.flags)||l.property('ADBE Effect Parade').numProperties!==row.effectCount||maskCount(l)!==row.maskCount)
                fail('GLYPH_GRAPH_CHANGED','Owned layer rendering flags, effects or masks changed.');
            if(l.id!==c.id&&(l.property('ADBE Root Vectors Group').numProperties!==row.vectorCount||
                property(l,['ADBE Root Vectors Group',1,'ADBE Vectors Group']).numProperties!==row.contentCount))
                fail('GLYPH_GRAPH_CHANGED','Owned shape contents changed.');
            if(l.outPoint+capacitySlack<s.duration)fail('GLYPH_SOURCE_COVERAGE','Owned inner layer coverage is insufficient.');
        }
        validateRendering(m,s);
        legacy=pathMappingVersion(m,s);
        if(c.property('ADBE Root Vectors Group').numProperties!==0||c.property('ADBE Effect Parade').numProperties!==countKeys(m.channels))fail('GLYPH_GRAPH_CHANGED','Owned controller contents changed.');
        for(name in m.channels)if(own(m.channels,name)){row=m.channels[name];p=fx(c,row.index);if(p.parentProperty.name!=='cpAF '+name||p.expression||p.numKeys)fail('GLYPH_BINDING_CHANGED','Source inputs must remain expression-free and static.');p=findEP(root,m,name,c);validateRootExpression(root,m,name,p,ins&&outs);}
        if(root.essentialProperty.numProperties!==countKeys(m.channels))fail('GLYPH_BINDING_CHANGED','Unexpected Essential Property binding.');
        for(i=0;i<m.expressions.length;i++){row=m.expressions[i];p=property(layer(s,row.layerId),row.path);if(p.expression!==row.expression||!p.expressionEnabled||p.expressionError)fail('GLYPH_BINDING_CHANGED','Owned consumer expression changed.');}
        pack=nativePack(m,s);values=copy(m.controls);for(name in m.rootInputs)if(own(m.rootInputs,name)){row=m.rootInputs[name];p=fx(root,row.index);if(p.parentProperty.name!=='cpAF '+name||p.expression||p.numKeys)fail('GLYPH_BINDING_CHANGED','Root input changed.');var v=copy(p.value);if(name==='color')v=v.slice(0,3);if(name.indexOf('Reverse')>=0)v=v>0.5;if(name.indexOf('offset:')===0)values.offsets[name.slice(7)]=v;else values[name]=v;}
        values.duration=root.outPoint-root.inPoint;if(ins)values.inEnabled=ins.enabled;if(outs)values.outEnabled=outs.enabled;layout=$.cpGlyphModel.layout(pack,m.text,values);
        if(ins&&outs){t=$.cpGlyphModel.resolveTiming(pack,layout,request(values,{inPoint:root.inPoint,outPoint:root.outPoint,inMarker:ins.time,outMarker:outs.time,frameDuration:root.containingComp.frameDuration},'read'));values.inSpeed=t.inSpeed;values.outSpeed=t.outSpeed;layout.controls=copy(values);limits(t,root.startTime);}
        if(s.duration+capacitySlack<root.outPoint-root.startTime)fail('GLYPH_SOURCE_COVERAGE','Owned source duration does not cover the root.');
        try{packFor(m.pack);}catch(e){if(e.code!=='GLYPH_PACK_UNAVAILABLE')throw e;unavailable=e.message;}
        if(write&&legacy)fail('GLYPH_REBUILD_REQUIRED','Rebuild this legacy glyph graph from its exact font pack before editing.');
        if(write&&unavailable)fail('GLYPH_PACK_UNAVAILABLE',unavailable);return {m:m,source:s,controller:c,pack:pack,layout:layout,controls:values,timing:t,inMarker:ins,outMarker:outs,unavailable:unavailable,legacy:legacy};
    }
    function countKeys(o) { var n=0,k;for(k in o)if(own(o,k))n++;return n; }
    function instances(root) { var m=metadata(root);return m?[copy(m)]:[]; }
    function controlIds(g) {
        var ids=timingControls.concat(visual),i;
        for(i=0;i<g.layout.glyphs.length;i++)ids.push('offset:'+g.layout.glyphs[i].textIndex);
        return ids;
    }
    function requireControl(g,id) {
        var ids=controlIds(g),i;
        if(typeof id==='string')for(i=0;i<ids.length;i++)if(ids[i]===id)return;
        fail('CONTROL_NOT_FOUND','Unknown animated-font descriptor control.');
    }
    function value(g,id) {
        requireControl(g,id);
        if(id.indexOf('offset:')===0)return copy(g.controls.offsets[id.slice(7)]);
        return copy(g.controls[id]);
    }
    function controls(root) {
        var g=graph(root,false,false),ids=controlIds(g);
        var names={duration:'Duration',inEnabled:'Animation In',outEnabled:'Animation Out',inSpeed:'In Speed',outSpeed:'Out Speed',inDelay:'In Delay',outDelay:'Out Delay',inReverse:'Reverse In',outReverse:'Reverse Out',size:'Size',tracking:'Tracking',skew:'Skew',color:'Color',verticalStagger:'Vertical Stagger',characterRotation:'Character Rotation'};
        var out=[],i,id,type,group,d,input,nativeProperty,readOnly=null,reason=null;
        if(root.locked){readOnly='LAYER_LOCKED';reason='Unlock the glyph root.';}
        for(i=1;i<=g.source.numLayers;i++)if(g.source.layer(i).locked){readOnly='LAYER_LOCKED';reason='Unlock the owned glyph layers.';}
        if(usage(g.source)!==1){readOnly='GLYPH_SOURCE_SHARED';reason='The owned source has additional references.';}
        if(g.unavailable){readOnly='GLYPH_PACK_UNAVAILABLE';reason=g.unavailable;}
        if(g.legacy){readOnly='GLYPH_REBUILD_REQUIRED';reason='Rebuild this legacy glyph graph from its exact font pack before editing.';}
        for(i=0;i<ids.length;i++){
            id=ids[i];
            if(id==='color')type='color';
            else if(id.indexOf('offset:')===0)type='point';
            else if(id.indexOf('Enabled')>=0||id.indexOf('Reverse')>=0)type='checkbox';
            else if(id==='duration'||id.indexOf('Delay')>=0)type='time';
            else type='slider';
            if(id.indexOf('offset:')===0)group='Character Offsets';
            else if(id.indexOf('in')===0)group='Animation In';
            else if(id.indexOf('out')===0)group='Animation Out';
            else group='Font';
            d={id:id,name:names[id]||id,type:type,value:value(g,id),instanceId:g.m.instanceId,
                group:group,enabled:!readOnly,actions:['reset']};
            if(id==='inSpeed'||id==='outSpeed')d.precision=2;
            if(id.indexOf('offset:')===0)d.name='Character '+(Number(id.slice(7))+1)+' Offset';
            if(readOnly){d.readOnlyCode=readOnly;d.readOnlyReason=reason;d.actions=[];}
            input=g.m.rootInputs[id];nativeProperty=input?fx(root,input.index):null;
            if(type==='time'||type==='slider'){
                if(nativeProperty&&nativeProperty.hasMin)d.min=nativeProperty.minValue;
                if(nativeProperty&&nativeProperty.hasMax)d.max=nativeProperty.maxValue;
                if(id==='duration'||id==='size'||id.indexOf('Speed')>=0)d.min=0.000001;
                if(id.indexOf('Delay')>=0)d.min=0;
                if(id==='duration')d.max=10800;
                if(id==='skew'){d.min=-85;d.max=85;}
            }
            out.push(d);
        }
        return out;
    }
    function getControl(root,id) { return value(graph(root,false,false),id); }
    function planControl(root,id,v,missing) {
        var g=graph(root,true,missing),before,c,t=g.timing,side,span,clock=g.pack.clock,n=g.layout.glyphs.length,req,row,p,i;
        requireControl(g,id);
        before=missing?null:value(g,id);c=copy(g.controls);
        if(id.indexOf('offset:')===0)c.offsets[id.slice(7)]=copy(v);
        else c[id]=copy(v);
        var layout=$.cpGlyphModel.layout(g.pack,g.m.text,c);c=layout.controls;storedBounds(c);
        if(!t){var create=$.cpGlyphModel.resolveTiming(g.pack,layout,request(c,{atTime:root.inPoint+(clock.entryEnd*100/c.inSpeed+(n-1)*c.inDelay),frameDuration:root.containingComp.frameDuration},'create'));t=create;if(g.inMarker)t.inMarker=g.inMarker.time;if(g.outMarker)t.outMarker=g.outMarker.time;t.inPoint=root.inPoint;t.outPoint=root.outPoint;}
        req=request(c,t,'read');req.inPoint=root.inPoint;req.outPoint=root.outPoint;
        if(id==='duration'){req.outPoint=root.inPoint+c.duration;req.outMarker=req.outPoint-t.outSpan;}
        else if(id.indexOf('in')===0||id.indexOf('out')===0){side=id.indexOf('in')===0?'in':'out';if(id.indexOf('Speed')>=0||id.indexOf('Delay')>=0||id.indexOf('Reverse')>=0){span=(side==='in'?(c.inReverse?clock.duration-clock.bodyEnd:clock.entryEnd):(c.outReverse?clock.entryEnd:clock.duration-clock.bodyEnd))*100/c[side+'Speed']+(n-1)*c[side+'Delay'];if(side==='in')req.inMarker=root.inPoint+span;else req.outMarker=root.outPoint-span;}}
        t=$.cpGlyphModel.resolveTiming(g.pack,layout,req);limits(t,root.startTime);$.cpTimeline.validate(root,g.m.instanceId,specs(t));
        nativeMarkerClearance(root,g.m.instanceId,specs(t));
        glyphMarkerPlan(root,g.m.instanceId,specs(t));
        row=g.m.rootInputs[id];if(row){p=fx(root,row.index);var vals=array(v)?v:[v];for(i=0;i<vals.length;i++)if(typeof vals[i]==='number'&&((p.hasMin&&vals[i]<p.minValue)||(p.hasMax&&vals[i]>p.maxValue)))fail('CONTROL_VALUE','Value exceeds the native property limits.');}
        return {g:g,id:id,value:copy(v),controls:c,timing:t,changed:missing||!equal(before,v),sideEffects:false,coverage:plannedCapacity(g.source,t.outPoint-root.startTime)};
    }
    function preflightControl(root,id,v) { var p=planControl(root,id,v,false);return {changed:p.changed,sideEffects:false}; }
    function sectionIds(g,section) {
        if(section==='Font')return ['duration'].concat(visual);
        if(section==='Animation In')return ['inEnabled','inSpeed','inDelay','inReverse'];
        if(section==='Animation Out')return ['outEnabled','outSpeed','outDelay','outReverse'];
        if(section==='Character Offsets'){var ids=[],i;for(i=0;i<g.layout.glyphs.length;i++)ids.push('offset:'+g.layout.glyphs[i].textIndex);return ids;}
        fail('GLYPH_PROPERTY_SET_SECTION','Unknown animated-font settings section.');
    }
    function controlType(id) { if(id==='color')return 'color';if(id.indexOf('offset:')===0)return 'point';if(id.indexOf('Enabled')>=0||id.indexOf('Reverse')>=0)return 'checkbox';if(id==='duration'||id.indexOf('Delay')>=0)return 'time';return 'slider'; }
    function captureControlSet(root,section) {
        var g=graph(root,false,false),ids=sectionIds(g,section),out={schemaVersion:1,kind:'animated-font-control-set',pack:copy(g.m.pack),section:section,controls:{}},i;
        if(section==='Character Offsets')out.textIdentity=g.m.text;
        for(i=0;i<ids.length;i++)out.controls[ids[i]]={type:controlType(ids[i]),value:value(g,ids[i])};
        return out;
    }
    function validateControlSet(g,data) {
        if(!data||data.schemaVersion!==1||data.kind!=='animated-font-control-set'||!data.pack||data.pack.id!==g.m.pack.id||data.pack.digest!==g.m.pack.digest||!data.controls)fail('GLYPH_PROPERTY_SET_IDENTITY','Saved settings require this exact authored pack.');
        var ids=sectionIds(g,data.section),i,k,count=0;
        if(data.section==='Character Offsets'&&data.textIdentity!==g.m.text)fail('GLYPH_PROPERTY_SET_IDENTITY','Character offsets require the exact original text.');
        for(k in data.controls)if(own(data.controls,k))count++;
        if(count!==ids.length)fail('GLYPH_PROPERTY_SET_SHAPE','Saved controls do not match this section.');
        for(i=0;i<ids.length;i++)if(!own(data.controls,ids[i])||!data.controls[ids[i]]||data.controls[ids[i]].type!==controlType(ids[i]))fail('GLYPH_PROPERTY_SET_SHAPE','Saved control types do not match this section.');
        return ids;
    }
    function planControlSet(root,data) {
        var g=graph(root,true,false),ids=validateControlSet(g,data),c=copy(g.controls),i,id,v,row,p,vals,j,changed=false,t=g.timing,req,span,side;
        for(i=0;i<ids.length;i++){id=ids[i];v=data.controls[id].value;if(!equal(value(g,id),v))changed=true;if(id.indexOf('offset:')===0)c.offsets[id.slice(7)]=copy(v);else c[id]=copy(v);}
        var layout=$.cpGlyphModel.layout(g.pack,g.m.text,c);c=layout.controls;storedBounds(c);req=request(c,t,'read');
        if(data.section==='Font'&&!equal(c.duration,g.controls.duration)){req.outPoint=root.inPoint+c.duration;req.outMarker=req.outPoint-t.outSpan;}
        if(data.section==='Animation In'||data.section==='Animation Out'){
            side=data.section==='Animation In'?'in':'out';
            span=(side==='in'?(c.inReverse?g.pack.clock.duration-g.pack.clock.bodyEnd:g.pack.clock.entryEnd):(c.outReverse?g.pack.clock.entryEnd:g.pack.clock.duration-g.pack.clock.bodyEnd))*100/c[side+'Speed']+(g.layout.glyphs.length-1)*c[side+'Delay'];
            if(side==='in')req.inMarker=root.inPoint+span;else req.outMarker=root.outPoint-span;
        }
        t=$.cpGlyphModel.resolveTiming(g.pack,layout,req);limits(t,root.startTime);$.cpTimeline.validate(root,g.m.instanceId,specs(t));nativeMarkerClearance(root,g.m.instanceId,specs(t));glyphMarkerPlan(root,g.m.instanceId,specs(t));
        for(i=0;i<ids.length;i++){id=ids[i];row=g.m.rootInputs[id];if(!row)continue;p=fx(root,row.index);v=data.controls[id].value;vals=array(v)?v:[v];for(j=0;j<vals.length;j++)if(typeof vals[j]==='number'&&((p.hasMin&&vals[j]<p.minValue)||(p.hasMax&&vals[j]>p.maxValue)))fail('CONTROL_VALUE','Value exceeds the native property limits.');}
        return {g:g,controls:c,timing:t,changed:changed,sideEffects:false,coverage:plannedCapacity(g.source,t.outPoint-root.startTime)};
    }
    function preflightControlSet(root,data) { var p=planControlSet(root,data);return {changed:p.changed,sideEffects:false}; }
    function applyControlSet(root,data) { return mutate(root,planControlSet(root,data)); }
    function controlSetsEqual(root,saved,current) {
        var g=graph(root,false,false),ids,i,id,a,b,phase,reverse;
        try{ids=validateControlSet(g,saved);validateControlSet(g,current);}catch(incompatible){return false;}
        if(saved.section!==current.section)return false;
        for(i=0;i<ids.length;i++){id=ids[i];a=saved.controls[id].value;b=current.controls[id].value;if(json(a)===json(b))continue;
            if(id==='duration'){if(!finite(a)||!finite(b)||Math.abs(a-b)>nativeTimeAllowance)return false;continue;}
            if(id==='inSpeed'||id==='outSpeed'){if(!finite(a)||!finite(b)||a<=0||b<=0)return false;reverse=saved.controls[id==='inSpeed'?'inReverse':'outReverse'].value;phase=id==='inSpeed'?(reverse?g.pack.clock.duration-g.pack.clock.bodyEnd:g.pack.clock.entryEnd):(reverse?g.pack.clock.entryEnd:g.pack.clock.duration-g.pack.clock.bodyEnd);if(Math.abs(phase*100/a-phase*100/b)>nativeTimeAllowance)return false;continue;}
            return false;
        }return true;
    }
    // AE's built-in numeric inputs store IEEE-754 single precision. This bound
    // is one ULP of the requested representation, not a timeline allowance.
    function nativeInputEqual(wanted,actual) {
        if(array(wanted)){if(!array(actual)||wanted.length!==actual.length)return false;for(var i=0;i<wanted.length;i++)if(!nativeInputEqual(wanted[i],actual[i]))return false;return true;}
        if(typeof wanted==='boolean')return wanted===actual;
        if(!finite(wanted)||!finite(actual))return false;
        if(wanted===actual)return true;
        var magnitude=Math.abs(wanted),exponent=-126,power;
        if(magnitude>=Math.pow(2,-126)){exponent=Math.floor(Math.log(magnitude)/Math.LN2);power=Math.pow(2,exponent);if(magnitude<power)exponent--;else if(magnitude>=power*2)exponent++;}
        return Math.abs(wanted-actual)<=Math.pow(2,exponent-23);
    }
    function verifyControlReadback(root,p,actual) {
        var m=p.g.m,k,wanted,read,raw,logical;
        if(actual.m.schemaVersion!==m.schemaVersion||actual.m.kind!==m.kind||actual.m.instanceId!==m.instanceId||actual.m.sourceId!==m.sourceId||actual.source.id!==p.g.source.id||actual.m.text!==m.text||actual.m.pack.id!==m.pack.id||actual.m.pack.digest!==m.pack.digest||json(actual.m.defaults)!==json(m.defaults))fail('GLYPH_CONTROL_READBACK','Owned identity or authored defaults changed during the control write.');
        for(k in m.rootInputs)if(own(m.rootInputs,k)){
            wanted=k.indexOf('offset:')===0?p.controls.offsets[k.slice(7)]:p.controls[k];
            logical=k.indexOf('offset:')===0?actual.controls.offsets[k.slice(7)]:actual.controls[k];
            read=fx(root,m.rootInputs[k].index).value;raw=wanted;
            if(k==='color')raw=wanted.concat([1]);
            if(typeof wanted==='boolean')raw=wanted?1:0;
            if(!nativeInputEqual(wanted,logical)||(typeof wanted==='boolean'?read!==raw:!nativeInputEqual(raw,read)))fail('GLYPH_CONTROL_READBACK','AE did not preserve the requested native control value: '+k+'.');
        }
        if(actual.controls.inEnabled!==p.controls.inEnabled||actual.controls.outEnabled!==p.controls.outEnabled)fail('GLYPH_CONTROL_READBACK','AE did not preserve the requested animation enabled flags.');
    }
    function mutate(root,p) {
        invalidateReadScope();
        if(!p.changed)return {changed:false};
        var g=p.g,m=g.m,s=g.source,oldComment=root.comment,oldOut=root.outPoint,oldIn=root.inPoint,oldDuration=s.duration,oldStart=root.startTime;
        var oldMarkerProperty=markerSnapshot(root,m.instanceId),markersTouched=false,outs=[],values={},k,i,row,actual,capacity,readback;
        for(i=1;i<=s.numLayers;i++)outs.push({id:s.layer(i).id,outPoint:s.layer(i).outPoint});
        for(k in m.rootInputs)if(own(m.rootInputs,k))values[k]=copy(fx(root,m.rootInputs[k].index).value);
        try {
            if(p.coverage>s.duration){
                s.duration=p.coverage;
                capacity=verifyCapacity(s,p.coverage,p.timing.outPoint-root.startTime);
                for(i=1;i<=s.numLayers;i++)if(s.layer(i).outPoint+capacitySlack<capacity)s.layer(i).outPoint=innerOutTarget(capacity);
            }
            if(root.outPoint!==p.timing.outPoint)root.outPoint=p.timing.outPoint;
            for(k in m.rootInputs)if(own(m.rootInputs,k)){
                row=k.indexOf('offset:')===0?p.controls.offsets[k.slice(7)]:p.controls[k];
                if(k==='color')row=row.concat([1]);
                if(typeof row==='boolean')row=row?1:0;
                if(!equal(values[k],row))fx(root,m.rootInputs[k].index).setValue(row);
            }
            if(ownedMarkersChanged(root,m.instanceId,specs(p.timing))){
                markersTouched=true;
                updateGlyphMarkers(root,m.instanceId,specs(p.timing),m.pack.id);
            }
            coverActualSourceInterval(s,root.outPoint-root.startTime);
            m.controls=copy(p.controls);save(root,m);actual=graph(root,false,false);
            readback=timingReadback(root,p.timing,oldStart,actual.timing);
            verifyControlReadback(root,p,actual);
            if(!foreignMarkersPreserved(root,m.instanceId,oldMarkerProperty)){
                markersTouched=true;
                fail('GLYPH_FOREIGN_MARKER_CHANGED','Native writes changed a foreign marker; the transaction was rejected.');
            }
            return {changed:true,timingReadback:readback};
        }catch(error){
            try{
                s.duration=oldDuration;
                for(i=0;i<outs.length;i++)layer(s,outs[i].id).outPoint=outs[i].outPoint;
                if(root.startTime!==oldStart)root.startTime=oldStart;
                if(root.inPoint!==oldIn)root.inPoint=oldIn;
                root.outPoint=oldOut;
                for(k in values)if(own(values,k))fx(root,m.rootInputs[k].index).setValue(values[k]);
                if(markersTouched||!foreignMarkersPreserved(root,m.instanceId,oldMarkerProperty))restoreMarkerSnapshot(root,oldMarkerProperty);
                root.comment=oldComment;
            }catch(rollback){error.rollbackError=String(rollback.message||rollback);}
            throw error;
        }
    }
    function setControl(root,id,v) { return mutate(root,planControl(root,id,v,false)); }
    function resetPlan(root,options) {
        if(!options||!own(options,'controlId'))fail('GLYPH_ACTION_UNSUPPORTED','Reset requires an explicit control ID.');
        var id=options.controlId,g=graph(root,true,true),v;
        requireControl(g,id);
        if(id.indexOf('offset:')===0)v=g.m.defaults.offsets[id.slice(7)];
        else v=g.m.defaults[id];
        return planControl(root,id,v,!g.inMarker||!g.outMarker);
    }
    function preflightReset(root,options) { var p=resetPlan(root,options);return {changed:p.changed,sideEffects:false}; }
    function reset(root,options) { return mutate(root,resetPlan(root,options)); }
    function serialize(root) { var g=graph(root,false,false),t=g.timing,markers=$.cpTimeline.serialize(root,g.m.instanceId);return {schemaVersion:1,kind:'animated-font',pack:copy(g.m.pack),text:g.m.text,controls:copy(g.controls),timeline:{inPoint:0,inMarker:t.inMarker-root.inPoint,outMarker:t.outMarker-root.inPoint,outPoint:root.outPoint-root.inPoint,frameDuration:t.frameDuration}}; }
    function restore(comp,data,options) { options=options||{};if(!data||data.schemaVersion!==1||data.kind!=='animated-font'||!data.pack||typeof data.pack.id!=='string'||typeof data.pack.digest!=='string'||!data.timeline||data.timeline.inPoint!==0)fail('INVALID_GLYPH_DATA','Invalid serialized glyph data.');var p=packFor(data.pack),l=$.cpGlyphModel.layout(p,data.text,data.controls),at=options.atTime===undefined?comp.time:options.atTime,t=data.timeline,requestData={inPoint:at,inMarker:at+t.inMarker,outMarker:at+t.outMarker,outPoint:at+t.outPoint,frameDuration:comp.frameDuration};l.controls.duration=t.outPoint;var timing=$.cpGlyphModel.resolveTiming(p,l,request(l.controls,requestData,'read'));return apply(comp,{pack:p,layout:l,timing:timing,controls:l.controls,text:data.text}); }
    function remove(root,id) { var g=graph(root,true,false);if(id!==g.m.instanceId)fail('GLYPH_GRAPH_CHANGED','The selected instance changed.');root.remove();try{g.source.remove();}catch(error){error.rollbackError='Root removal succeeded, but owned source cleanup failed.';throw error;}return {removed:true,sourceRemoved:true}; }
    $.cpGlyph={version:1,configure:configure,preflight:preflight,apply:apply,instances:instances,controls:controls,preflightControl:preflightControl,getControl:getControl,setControl:setControl,preflightReset:preflightReset,reset:reset,serialize:serialize,restore:restore,remove:remove,captureControlSet:captureControlSet,preflightControlSet:preflightControlSet,applyControlSet:applyControlSet,controlSetsEqual:controlSetsEqual,withReadSnapshot:withReadSnapshot};
})();
