/* Read an explicitly selected composition into owned temporary frames. */
(function(){
 var jobs={};
 function fail(code,message){var e=new Error(message);e.code=code;throw e;}
 function finite(v){return typeof v==='number'&&isFinite(v);}
 function ensure(folder){if(folder.alias)fail('THUMBNAIL_PATH','미리보기 폴더에 링크를 사용할 수 없습니다.');if(folder.parent&&folder.parent.fsName!==folder.fsName)ensure(folder.parent);if(!folder.exists&&!folder.create())fail('THUMBNAIL_PATH','미리보기 폴더를 만들 수 없습니다.');}
 function describe(comp){
  if(!comp||typeof comp.saveFrameToPng!=='function'||!finite(comp.duration)||comp.duration<=0)fail('THUMBNAIL_COMPOSITION','미리보기로 쓸 컴포지션을 열어주세요.');
  if(comp.width*comp.height>33554432||comp.width>8192||comp.height>8192)fail('THUMBNAIL_DIMENSIONS','컴포지션 미리보기는 최대 8192픽셀, 32메가픽셀을 지원합니다.');
  var start=Math.max(0,comp.workAreaStart),duration=Math.min(comp.workAreaDuration,comp.duration-start);
  if(!finite(start)||!finite(duration)||duration<=0)fail('THUMBNAIL_RANGE','컴포지션 작업 영역을 확인하세요.');
  return{compositionId:comp.id,name:comp.name,start:start,duration:duration,width:comp.width,height:comp.height};
 }
 function frame(comp,options){
  describe(comp);if(typeof options.jobId!=='string'||!/^[a-f0-9]{24}$/.test(options.jobId)||!finite(options.frameIndex)||options.frameIndex%1!==0||options.frameIndex<0||options.frameIndex>=12)fail('THUMBNAIL_JOB','미리보기 작업 ID가 올바르지 않습니다.');
  if(!finite(options.time)||options.time<0||options.time>=comp.duration)fail('THUMBNAIL_TIME','미리보기 프레임 시간이 컴포지션 범위를 벗어났습니다.');
  var folder=new Folder(Folder.userData.fsName+'/Contentrium/Preset/ThumbnailFrames/'+options.jobId);if(folder.exists&&!jobs[options.jobId])fail('THUMBNAIL_EXISTS','다른 작업의 임시 폴더가 이미 존재합니다.');ensure(folder);jobs[options.jobId]=true;
  var file=new File(folder.fsName+'/frame-'+options.frameIndex+'.png');if(file.exists)fail('THUMBNAIL_EXISTS','미리보기 임시 프레임이 이미 존재합니다.');
  // AE can return before its PNG writer has closed the file. The CEP reader
  // waits for a complete PNG before decoding; do not treat a zero-byte stat here
  // as a failed render or try to remove a still-open native output.
  comp.saveFrameToPng(options.time,file);
  return{path:file.fsName,time:options.time,frameIndex:options.frameIndex,pending:true};
 }
 // evalScript runs on AE's main thread: cleanup is serialized after a render,
 // including a render whose CEP caller has already timed out.
 function cleanup(options){
  var id=options.jobId;if(typeof id!=='string'||!/^[a-f0-9]{24}$/.test(id))fail('THUMBNAIL_JOB','미리보기 작업 ID가 올바르지 않습니다.');
  if(!jobs[id])return{removed:false};var folder=new Folder(Folder.userData.fsName+'/Contentrium/Preset/ThumbnailFrames/'+id);
  if(!folder.exists){delete jobs[id];return{removed:false};}ensure(folder);var files=folder.getFiles(),i;
  for(i=0;i<files.length;i++)if(!(files[i] instanceof File)||files[i].alias||!/^frame-(?:[0-9]|1[01])\.png$/.test(files[i].name))fail('THUMBNAIL_CONTENTS','미리보기 임시 폴더에 예상하지 못한 파일이 있습니다.');
  for(i=0;i<files.length;i++)if(!files[i].remove())return{removed:false,pending:true};
  if(!folder.remove())fail('THUMBNAIL_CLEANUP','미리보기 임시 폴더를 정리하지 못했습니다.');delete jobs[id];return{removed:true};
 }
 $.cpThumbnails={describe:describe,frame:frame,cleanup:cleanup};
}());
