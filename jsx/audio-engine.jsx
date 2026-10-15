(function(){
 var root=Folder.userData.fsName+'/Contentrium/Preset/UserAudio';
 function parse(s){if(typeof JSON!=='undefined'&&JSON.parse)return JSON.parse(s);if(/^[\],:{}\s]*$/.test(String(s).replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g,'@').replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,']').replace(/(?:^|:|,)(?:\s*\[)+/g,'')))return eval('('+s+')');throw new Error('Invalid audio library');}
 function manifest(){var f=new File(root+'/library.json');if(!f.exists||!f.open('r'))return{assets:{}};f.encoding='UTF-8';try{var m=parse(f.read());return m&&m.schemaVersion===1&&m.assets?m:{assets:{}};}finally{f.close();}}
 function resolve(key){if(!/^[a-z0-9-]+$/.test(String(key)))return null;var name=manifest().assets[key];if(typeof name!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._ -]*\.(wav|aif|aiff|mp3)$/i.test(name)||name.indexOf('..')!==-1)return null;var f=new File(root+'/'+name);return f.exists?f:null;}
 function normalized(f){return String(f.fsName).replace(/\\/g,'/').toLowerCase();}
 function importFile(key){var f=resolve(key);if(!f||!app.project)return null;for(var i=1;i<=app.project.numItems;i++){var item=app.project.item(i);if(item.file&&normalized(item.file)===normalized(f))return item;}return app.project.importFile(new ImportOptions(f));}
 $.cpAudio={root:root,resolve:resolve,importFile:importFile};
})();
