(function(scope){
 'use strict';
 function mount(button,options){
  if(!button)return;options=options||{};
  button.onclick=function(){
   var dialog=document.createElement('dialog'),title=document.createElement('h2'),description=document.createElement('p'),input=document.createElement('input'),browse=document.createElement('button'),start=document.createElement('button'),close=document.createElement('button'),progress=document.createElement('progress'),status=document.createElement('p'),actions=document.createElement('div'),busy=false;
   dialog.className='preset-pack-dialog';title.textContent='프리셋 팩 ZIP 등록';description.textContent='별도로 받은 Contentrium Preset 팩을 등록하세요. 플러그인 업데이트와 프리셋 팩은 각각 관리됩니다.';
   input.type='text';input.placeholder='ZIP 파일 경로';input.setAttribute('aria-label','프리셋 팩 ZIP 파일 경로');input.style.width='100%';
   browse.textContent='찾아보기';start.textContent='등록';close.textContent='닫기';progress.max=1;progress.value=0;progress.style.width='100%';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
   var api=scope.cep&&scope.cep.fs,choose=api&&(api.showOpenDialogEx||api.showOpenDialog);browse.disabled=!choose;
   browse.onclick=function(){try{var result=choose.call(api,false,false,'프리셋 팩 ZIP 선택','','zip');if(result.err===0&&result.data&&result.data[0])input.value=result.data[0];}catch(e){status.textContent='파일 경로를 복사해 붙여넣어 주세요.';}};
   close.onclick=function(){if(!busy)dialog.close();};dialog.addEventListener('cancel',function(e){if(busy)e.preventDefault();});dialog.addEventListener('close',function(){dialog.remove();});
   start.onclick=async function(){
    if(busy)return;var archive=input.value.trim().replace(/^"(.*)"$/,'$1');if(!archive){status.textContent='ZIP 파일을 선택하거나 경로를 입력하세요.';input.focus();return;}
    busy=true;start.disabled=true;close.disabled=true;browse.disabled=true;input.disabled=true;status.textContent='프리셋 팩을 확인하고 있습니다. AE의 프로젝트에는 변경하지 않습니다.';
    try{
     var nodeRequire=options.nodeRequire||(typeof require==='function'?require:scope.cep_node&&scope.cep_node.require);if(!nodeRequire)throw Error('After Effects 안에서 팩을 등록해 주세요.');
     var manager=options.manager||nodeRequire('./preset-packs/manager.cjs'),appData=options.appData||nodeRequire('process').env.APPDATA;
     var result=await manager.importZip({archive:archive,appData:appData,onProgress:function(value){if(value.total>0)progress.value=Math.min(1,value.bytes/value.total);status.textContent='파일 확인·압축 해제 '+(value.files||0).toLocaleString()+'개 · '+Math.round(progress.value*100)+'%';}});
     progress.value=1;status.textContent='등록 완료: '+result.counts.variants.toLocaleString()+'개 변형, '+result.counts.sounds.toLocaleString()+'개 음원. 현재 적용 가능 변형은 '+result.counts.accepted.toLocaleString()+'개입니다. 프로젝트를 저장하고 AE를 다시 열면 연결됩니다.';start.hidden=true;
    }catch(e){status.textContent='등록하지 못했습니다: '+String(e.message||e);start.disabled=false;}
    finally{busy=false;close.disabled=false;input.disabled=false;browse.disabled=!choose;}
   };
   actions.className='dialog-actions';actions.append(browse,start,close);dialog.append(title,description,input,progress,status,actions);document.body.appendChild(dialog);dialog.showModal();input.focus();return dialog;
  };
 }
 scope.ContentriumPresetPacks={mount:mount};if(typeof module!=='undefined'&&module.exports)module.exports={mount:mount};
})(typeof window!=='undefined'?window:globalThis);
