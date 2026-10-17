/* Independent, read-only image-sequence discovery and guarded AE import.
   No disk writes/deletion. The calling facade owns its Undo group. */
(function () {
    var extensions = ['png','jpg','jpeg','tif','tiff','exr','dpx','cin','bmp','tga','psd','hdr','iff','rla','rpf','sgi','rgb','rgba'];
    function fail(code,message){var e=new Error(message);e.code=code;throw e;}
    function array(v){return Object.prototype.toString.call(v)==='[object Array]';}
    function finite(v){return typeof v==='number'&&isFinite(v);}
    function normal(v){var path=String(v).replace(/\\/g,'/');if(path==='/'||/^[A-Za-z]:\/$/.test(path))return path;return path.replace(/\/+$/,'');}
    function canonical(v){return normal(v).toLowerCase();}
    function absolute(v){return /^(?:[A-Za-z]:\/|\/)/.test(v);}
    function folder(v){return v&&typeof v.getFiles==='function';}
    function contains(list,value){for(var i=0;i<list.length;i++)if(list[i]===value)return true;return false;}
    function getPath(value){if(typeof value==='string')return normal(value);if(value&&typeof value.fsName==='string')return normal(value.fsName);if(value&&typeof value.path==='string')return normal(value.path);return null;}
    function listing(input){
        if(array(input))return input;
        if(folder(input)){if(input.exists===false)fail('SEQUENCE_PATH_MISSING','The sequence folder does not exist.');return input.getFiles();}
        var path=getPath(input);if(!path||!absolute(path))fail('SEQUENCE_PATH','Use an absolute folder or image path.');
        // File(path) resolves existing directories to Folder. new Folder(filePath)
        // can report exists=true in AE and return an empty listing for a real file.
        var file=typeof input==='object'&&input.parent?input:File(path);
        if(folder(file)){if(file.exists===false)fail('SEQUENCE_PATH_MISSING','The sequence folder does not exist.');return file.getFiles();}
        if(file.exists===false)fail('SEQUENCE_PATH_MISSING','The sequence file does not exist.');
        if(!file.parent||typeof file.parent.getFiles!=='function')file=new File(path);
        return file.parent.getFiles();
    }
    function finish(g){
        g.files.sort(function(a,b){if(a.frame!==b.frame)return a.frame-b.frame;return a.path<b.path?-1:(a.path>b.path?1:0);});
        g.startFrame=g.files[0].frame;g.endFrame=g.files[g.files.length-1].frame;g.count=g.files.length;g.expectedCount=g.endFrame-g.startFrame+1;g.missingRanges=[];g.missingFrameCount=0;g.duplicates=[];
        var previous=null,dupe=null,i,f;for(i=0;i<g.files.length;i++){f=g.files[i];if(previous!==null&&f.frame===previous){if(!dupe){dupe={frame:f.frame,paths:[g.files[i-1].path]};g.duplicates.push(dupe);}dupe.paths.push(f.path);}else{dupe=null;if(previous!==null&&f.frame>previous+1){g.missingRanges.push({start:previous+1,end:f.frame-1});g.missingFrameCount+=f.frame-previous-1;}previous=f.frame;}}
        g.contiguous=g.missingFrameCount===0&&g.duplicates.length===0;g.importable=g.count>=2&&g.contiguous;
    }
    function scan(input){
        var entries=listing(input),result={schemaVersion:1,groups:[],sequences:[],numberedSingles:[],stills:[],ignored:[],totalFiles:0},by={},i,entry,path,name,at,ext,stem,match,key,g,frame;
        for(i=0;i<entries.length;i++){
            entry=entries[i];if(folder(entry)){result.ignored.push({path:getPath(entry),reason:'directory'});continue;}
            path=getPath(entry);if(!path||!absolute(path)){result.ignored.push({path:path,reason:'invalid-absolute-path'});continue;}result.totalFiles++;
            if(entry&&typeof entry==='object'&&entry.exists===false){result.ignored.push({path:path,reason:'missing-file'});continue;}
            name=path.slice(path.lastIndexOf('/')+1);at=name.lastIndexOf('.');ext=at>=0?name.slice(at+1).toLowerCase():'';
            if(!contains(extensions,ext)){result.ignored.push({path:path,reason:'unsupported-extension'});continue;}
            stem=name.slice(0,at);match=/^(.*?)([0-9]+)([^0-9]*)$/.exec(stem);if(!match){result.stills.push({path:path,name:name,extension:ext,reason:'no-frame-number'});continue;}
            frame=Number(match[2]);if(!finite(frame)||frame>9007199254740990){result.ignored.push({path:path,reason:'unsafe-frame-number'});continue;}
            var directory=path.slice(0,path.lastIndexOf('/')),pattern=canonical(directory)+'|'+match[1].toLowerCase()+'|'+match[3].toLowerCase()+'|'+ext;
            key=pattern+'|'+match[2].length;g=by[key];if(!g){g={id:'sequence:'+encodeURIComponent(key),directory:directory,prefix:match[1],suffix:match[3],padding:match[2].length,extension:ext,patternKey:pattern,files:[]};by[key]=g;result.groups.push(g);}
            g.files.push({path:path,name:name,frame:frame});
        }
        result.groups.sort(function(a,b){return a.id<b.id?-1:(a.id>b.id?1:0);});
        for(i=0;i<result.groups.length;i++){g=result.groups[i];finish(g);if(g.count>=2)result.sequences.push(g);else result.numberedSingles.push(g);}
        result.stills.sort(function(a,b){return a.path<b.path?-1:(a.path>b.path?1:0);});return result;
    }
    function schema(){return{version:1,sequence:{implemented:true,nativeValidated:false},forceAlphabetical:{implemented:true,nativeValidated:false,apiDocumented:true,defaultValue:false,scope:'Only when the directory contains exactly the selected sequence files.'},frameRate:{implemented:true,nativeValidated:false,apiDocumented:true,defaultValue:null,option:'conformFrameRate',minimumExclusive:0,maximum:99},range:{supported:false,reason:'ImportOptions.rangeStart/rangeEnd are undocumented and not verified; range requests are rejected.'},extensions:extensions.slice(),formatCaution:'Discovery does not prove this AE installation can decode every listed format.'};}
    function plan(group,options){
        options=options||{};var key;for(key in options)if(options.hasOwnProperty(key)){if(key==='range'||key==='rangeStart'||key==='rangeEnd'||key==='startFrame'||key==='endFrame')fail('SEQUENCE_RANGE_UNSUPPORTED','Frame range import is not supported.');if(key!=='forceAlphabetical'&&key!=='conformFrameRate')fail('SEQUENCE_OPTION_UNSUPPORTED','Unsupported sequence option: '+key);}
        if(options.forceAlphabetical!==undefined&&typeof options.forceAlphabetical!=='boolean')fail('SEQUENCE_ORDER','forceAlphabetical requires a boolean.');
        var rate=options.conformFrameRate;if(rate!==undefined&&rate!==null&&(!finite(rate)||rate<=0||rate>99))fail('SEQUENCE_FPS','A conformed frame rate must be a finite number greater than 0 and at most 99.');
        if(!group||!array(group.files))fail('SEQUENCE_GROUP','Select a discovered numbered image group.');
        var discovered=scan(group.files);if(discovered.groups.length!==1||discovered.stills.length||discovered.ignored.length)fail('SEQUENCE_GROUP','The files do not form one supported numbered group.');var g=discovered.groups[0];
        if(group.id&&group.id!==g.id)fail('SEQUENCE_GROUP','The sequence identity does not match its files.');
        if(g.duplicates.length)fail('SEQUENCE_DUPLICATES','Duplicate sequence frames must be resolved before import.');if(g.missingFrameCount)fail('SEQUENCE_GAPS','Missing sequence frames must be resolved before import.');if(g.count<2)fail('SEQUENCE_SINGLE','At least two numbered images are required for a sequence.');
        var files=[];for(var i=0;i<g.files.length;i++)files.push(g.files[i].path);
        return{schemaVersion:1,groupId:g.id,patternKey:g.patternKey,directory:g.directory,padding:g.padding,file:files[0],files:files,frameCount:g.count,firstFrame:g.startFrame,lastFrame:g.endFrame,sequence:true,forceAlphabetical:options.forceAlphabetical===true,conformFrameRate:rate===undefined?null:rate};
    }
    function sameFiles(a,b){if(a.length!==b.length)return false;for(var i=0;i<a.length;i++)if(canonical(a[i])!==canonical(b[i].path))return false;return true;}
    function importSequence(group,options){
        var prepared=plan(group,options),current=scan(new File(prepared.file)),fresh=null,i;
        for(i=0;i<current.groups.length;i++){var candidate=current.groups[i];if(candidate.patternKey===prepared.patternKey&&candidate.padding!==prepared.padding)fail('SEQUENCE_AMBIGUOUS_PADDING','Another padding width shares this sequence pattern. Native grouping is ambiguous.');if(candidate.id===prepared.groupId)fresh=candidate;}
        if(!fresh||!fresh.importable||!sameFiles(prepared.files,fresh.files))fail('SEQUENCE_STALE','The sequence directory changed. Scan it again before importing.');
        if(prepared.forceAlphabetical&&current.totalFiles!==fresh.count)fail('SEQUENCE_ALPHABETICAL_SCOPE','Alphabetical import requires a folder containing only the selected sequence files.');
        if(typeof ImportOptions!=='function'||!app.project||typeof app.project.importFile!=='function')fail('SEQUENCE_HOST_UNAVAILABLE','The After Effects import API is unavailable.');
        var io=new ImportOptions(new File(prepared.file));io.sequence=true;io.forceAlphabetical=prepared.forceAlphabetical;
        if(typeof ImportAsType!=='undefined'&&ImportAsType.FOOTAGE!==undefined)io.importAs=ImportAsType.FOOTAGE;
        var item=null;try{
            item=app.project.importFile(io);if(!item||!item.mainSource||item.mainSource.isStill!==false)fail('SEQUENCE_NOT_TIME_BASED','After Effects did not import time-based sequence footage.');
            if(prepared.conformFrameRate!==null)item.mainSource.conformFrameRate=prepared.conformFrameRate;
            var fps=item.frameRate,actualCount=finite(fps)&&fps>0&&finite(item.duration)?Math.round(item.duration*fps):null;
            if(actualCount!==null&&actualCount!==prepared.frameCount)fail('SEQUENCE_FRAME_COUNT','The imported frame count differs from the discovered sequence.');
            var actualConform=item.mainSource.conformFrameRate,warnings=[];if(prepared.conformFrameRate!==null&&actualConform!==prepared.conformFrameRate)warnings.push('Host conform frame rate differs from the requested value; inspect the actual readback.');
            return{item:item,receipt:{schemaVersion:1,groupId:prepared.groupId,itemId:item.id,file:prepared.file,frameCount:prepared.frameCount,actualFrameCount:actualCount,firstFrame:prepared.firstFrame,lastFrame:prepared.lastFrame,sequence:true,forceAlphabetical:prepared.forceAlphabetical,requestedFrameRate:prepared.conformFrameRate,conformFrameRate:finite(actualConform)?actualConform:null,frameRate:finite(fps)?fps:null,warnings:warnings}};
        }catch(error){if(item&&typeof item.remove==='function')try{item.remove();}catch(rollback){error.rollbackError=String(rollback.message||rollback);}throw error;}
    }
    $.cpSequence={version:1,scan:scan,plan:plan,importSequence:importSequence,schema:schema};
}());
