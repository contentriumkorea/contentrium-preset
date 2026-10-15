'use strict';
// Build-time adapter: only our pure engine APIs run here. The panel consumes JSON.
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),STEPS=512,KINDS=['position','scale','rotation','opacity','blur'],TOLERANCES=[.02,.02,.02,.00001,.00001,.00001,.005,.0001,.02];
function load(relative,context){const source=fs.readFileSync(path.join(root,relative),'utf8');vm.runInNewContext(source,context,{filename:relative,timeout:10000});return crypto.createHash('sha256').update(source).digest('hex');}
function rounded(value){if(!Number.isFinite(value))throw new Error('Nonfinite pure profile sample');return Math.round(value*1e9)/1e9;}
function overlayRow(api,id,p,side){const v=KINDS.map(k=>api.sample(id,p,k,side));return [...v[0],...v[1],v[2],v[3],v[4]].map(rounded);}
function textRow(api,id,p,side){
 const word='CONTENTRIUM',row=[];
 for(let i=1;i<=word.length;i++){
  const groups=api.sampleText(id,p,side,i,word.length,word),pose=[0,0,0,1,1,1,0,1,0,0];
  for(const group of groups){
   if(group.selectors.some(s=>s.nativeRangeEvaluationRequired))throw new Error('Native text range renderer required: '+id);
   const amount=group.selectors[0].parameters['ADBE Text Expressible Amount'].map(n=>n/100),props=group.properties,pos=props['ADBE Text Position 3D'],scale=props['ADBE Text Scale 3D'];
   if(pos)for(let j=0;j<3;j++)pose[j]+=pos[j]*amount[j];
   if(scale)for(let j=0;j<3;j++)pose[3+j]*=1+(scale[j]/100-1)*amount[j];
   pose[6]+=(props['ADBE Text Rotation']||0)*amount[2];
   if(props['ADBE Text Opacity']!=null)pose[7]*=1+(props['ADBE Text Opacity']/100-1)*amount[0];
   pose[9]+=(props['ADBE Text Tracking Amount']||0)*amount[0];
  }
  row.push(...pose.map(rounded));
 }
 return row;
}
function bakeSide(api,id,side,text){
 const get=p=>text?textRow(api,id,p,side):overlayRow(api,id,p,side),tolerance=j=>(text?(j%10===9?.02:TOLERANCES[j%10]):TOLERANCES[j])*.5;
 const times=[0],rows=[get(0)];let residual=0;
 function refine(a,ra,b,rb,depth){
  const t=(a+b)/2,r=get(t);let ratio=0;
  for(const f of [.25,.5,.75]){const probe=f===.5?r:get(a+(b-a)*f);probe.forEach((n,j)=>{ratio=Math.max(ratio,Math.abs(n-(ra[j]+(rb[j]-ra[j])*f))/tolerance(j));});}
  if(ratio>1&&depth<22){refine(a,ra,t,r,depth+1);refine(t,r,b,rb,depth+1);}
  else{residual=Math.max(residual,ratio);times.push(b);rows.push(rb);}
 }
 for(let i=0;i<STEPS;i++)refine(i/STEPS,get(i/STEPS),(i+1)/STEPS,get((i+1)/STEPS),0);
 return{times,rows,residual};
}
function build(){
 const context={$:{}},sources={'jsx/presets.jsx':load('jsx/presets.jsx',context),'jsx/precomp-engine.jsx':load('jsx/precomp-engine.jsx',context)},overlay=context.$.cpPresetBuilder,precomp=context.$.cpPrecomp,profiles={};
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'library/catalog.json'),'utf8'));
 for(const entry of catalog.entries)for(const variant of entry.variants){
  const id=String(variant.id),p=overlay.profile(id);let out;
  if(p){
   out={id,kind:p.kind,inDuration:p.inDuration,outDuration:p.outDuration,referenceWidth:1280,referenceHeight:720,fidelity:'motion-pending'};
   // Text selectors and compound effects need their own pure renderer contract.
   const text=p.kind==='text'&&typeof overlay.sampleText==='function'&&!overlay.sampleText(id,.5,'in',1,11,'CONTENTRIUM').some(g=>g.selectors.some(s=>s.nativeRangeEvaluationRequired));
   if(((p.kind==='layer'||p.kind==='edge')&&Object.keys(p.channels).length)||text){
    out.fidelity='engine-sampled';out.samples={};out.sampleTimes={};out.midpointToleranceRatio=0;
    if(text)out.text='CONTENTRIUM';if(p.kind==='edge')out.origin=[(p.axis[0]+1)/2,(p.axis[1]+1)/2];
    for(const side of ['in','out']){const baked=bakeSide(overlay,id,side,text);out.samples[side]=baked.rows;out.sampleTimes[side]=baked.times;out.midpointToleranceRatio=Math.max(out.midpointToleranceRatio,baked.residual);}
   }
   if(p.kind==='shadow'){out.fidelity='effect-graph-illustration';out.controls=p.controls;}
  }else{out=JSON.parse(JSON.stringify(precomp.profile(id)));}
  profiles[id]=out;
 }
 return{schemaVersion:1,interpolation:'adaptive-linear',midpointTolerances:TOLERANCES,sources,profiles};
}
if(require.main===module){const result=build(),target=path.join(root,'library/preview-profiles.json');fs.writeFileSync(target,JSON.stringify(result)+'\n');const p=Object.values(result.profiles);console.log(JSON.stringify({file:'library/preview-profiles.json',profiles:p.length,animated:p.filter(x=>x.samples).length,staticIllustrations:p.filter(x=>x.fidelity==='effect-graph-illustration').length,pending:p.filter(x=>!x.samples&&x.fidelity!=='effect-graph-illustration').length,bytes:fs.statSync(target).size,maxMidpointToleranceRatio:Math.max(...p.map(x=>x.midpointToleranceRatio||0))}));}
module.exports={build,overlayRow,textRow};
