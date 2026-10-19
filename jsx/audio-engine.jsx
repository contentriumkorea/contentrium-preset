(function(){
 var root=Folder.userData.fsName+'/Contentrium/Preset/UserAudio';
 var productRoot='';try{productRoot=String($.cpPresetRoot||'');if(!productRoot&&$.fileName){var scriptPath=String($.fileName).replace(/\\/g,'/'),jsxAt=scriptPath.lastIndexOf('/jsx/');if(jsxAt>=0)productRoot=scriptPath.substring(0,jsxAt);}}catch(ignoreProductRoot){}
 var builtins={'cp-preset-whoosh':'contentrium-generated-whoosh.wav','cp-preset-pop':'contentrium-generated-pop.wav','cp-preset-impact':'contentrium-generated-impact.wav','cp-preset-digital':'contentrium-generated-digital.wav'};
 function parse(s){if(!$.cpJson||typeof $.cpJson.parse!=='function'){var error=new Error('Load json-engine.jsx before parsing preset data.');error.code='JSON_ENGINE_REQUIRED';throw error;}return $.cpJson.parse(s);}
 function manifest(){var f=new File(root+'/library.json');if(!f.exists||!f.open('r'))return{assets:{}};f.encoding='UTF-8';try{var m=parse(f.read());return m&&m.schemaVersion===1&&m.assets?m:{assets:{}};}finally{f.close();}}
 function resolve(key){key=String(key);if(Object.prototype.hasOwnProperty.call(builtins,key)){var bundled=new File(productRoot+'/assets/audio/'+builtins[key]);return bundled.exists?bundled:null;}if(!/^[a-z0-9-]+$/.test(key))return null;var name=manifest().assets[key];if(typeof name!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._ -]*\.(wav|aif|aiff|mp3)$/i.test(name)||name.indexOf('..')!==-1)return null;var f=new File(root+'/'+name);return f.exists?f:null;}
 function normalized(f){return String(f.fsName).replace(/\\/g,'/').toLowerCase();}
 function importFile(key){var f=resolve(key);if(!f||!app.project)return null;for(var i=1;i<=app.project.numItems;i++){var item=app.project.item(i);if(item.file&&normalized(item.file)===normalized(f))return item;}return app.project.importFile(new ImportOptions(f));}
 $.cpAudio={root:root,resolve:resolve,importFile:importFile};
})();
