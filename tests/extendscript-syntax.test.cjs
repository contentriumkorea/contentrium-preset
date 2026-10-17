const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),acorn=require('acorn');

// Native AE rejects these object keys even though Acorn's ES3 default accepts
// them. Quoted keys and member access are valid (verified in the native oracle).
function unsafeReservedKeys(source){
 const reserved=new Set(('break case catch continue default delete do else finally for function if in instanceof new return switch this throw try typeof var void while with null true false abstract boolean byte char class const debugger double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile').split(' '));
 const tree=acorn.parse(source,{ecmaVersion:3,allowReserved:false,locations:true}),unsafe=[];
 (function walk(node){if(!node||typeof node!=='object')return;if(node.type==='Property'&&node.key.type==='Identifier'&&reserved.has(node.key.name))unsafe.push({key:node.key.name,line:node.key.loc.start.line});for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value.type==='string')walk(value);}})(tree);
 return unsafe;
}
test('native reserved-word regression catches bindings and unquoted object keys',()=>{
 assert.throws(()=>unsafeReservedKeys('var native=1;'));
 for(const key of ['native','in','default','class'])assert.deepEqual(unsafeReservedKeys('var result={'+key+':1};'),[{key,line:1}]);
});
test('native reserved-word regression permits quoted keys and ordinary member reads',()=>{
 assert.deepEqual(unsafeReservedKeys('var result={"native":1,"in":2};result.native;result.in;'),[]);
});
test('all shipped host JSX uses native-compatible identifiers and object keys',()=>{
 const directory=path.join(__dirname,'../jsx'),unsafe=[];
 for(const name of fs.readdirSync(directory).filter(n=>n.endsWith('.jsx')))for(const issue of unsafeReservedKeys(fs.readFileSync(path.join(directory,name),'utf8')))unsafe.push({file:name,...issue});
 assert.deepEqual(unsafe,[]);
});

// AE 26.5's ExtendScript evaluates an ungrouped a?b:c?d:e chain differently
// from V8. Native control routing exposed this even though Node tests passed.
function bareConditionalBranches(source,name){
 const unsafe=[],tree=acorn.parse(source,{ecmaVersion:5,locations:true,preserveParens:true});
 function walk(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='ConditionalExpression')for(const side of ['test','consequent','alternate'])if(node[side].type==='ConditionalExpression')unsafe.push(name+':'+node[side].loc.start.line+' '+side+' '+source.slice(node[side].start,node[side].end).slice(0,120));
  for(const key of Object.keys(node)){const value=node[key];if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value.type==='string')walk(value);}
 }
 walk(tree);return unsafe;
}
test('nested conditional scanner rejects ungrouped branches including the native oracle shape',()=>{
 assert.equal(bareConditionalBranches("var x=true?'first':false?'second':false?'third':'fourth';",'oracle').length,2);
 assert.equal(bareConditionalBranches('var x=a?b:c?d:e;','alternate').length,1);
 assert.equal(bareConditionalBranches('var x=a?b?c:d:e;','consequent').length,1);
});
test('nested conditional scanner preserves explicit grouping and ignores independent branches',()=>{
 for(const source of ['var x=a?b:(c?d:e);','var x=(a?b:c)?d:e;','var x=a?(b?c:d):e;','var x=a?b:c,y=d?e:f;','var x="a?b:c?d:e";'])assert.deepEqual(bareConditionalBranches(source,'safe'),[],source);
});
test('host JSX makes every nested conditional branch explicit for ExtendScript',()=>{
 const directory=path.join(__dirname,'../jsx'),unsafe=[];
 for(const name of fs.readdirSync(directory).filter(n=>n.endsWith('.jsx'))){
  const source=fs.readFileSync(path.join(directory,name),'utf8');unsafe.push(...bareConditionalBranches(source,name));
 }
 assert.deepEqual(unsafe,[],'Parenthesize conditional branches so native AE and JavaScript use the same routing');
});
