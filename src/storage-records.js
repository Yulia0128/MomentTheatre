import {canonical,sha256} from './sync-integrity.js';

export const RECORD_CHARS=128*1024, PAGE_SIZE=64;
const hashPattern=/^[a-f0-9]{64}$/;
export const digest=value=>sha256(canonical(value));
export const canonicalEqual=(a,b)=>canonical(a)===canonical(b);
export const seal=value=>({...value,checksum:digest(value)});
export function unseal(value){
  if(!value||typeof value!=='object')throw Error('资料版本记录缺失。');
  const {checksum,...body}=value;
  if(checksum!==digest(body))throw Error('资料版本校验失败。');
  return body;
}
// Entities and chapters always get their own branches, even when small. Large
// text is bounded; index arrays are themselves paged, never one unlimited row.
export function encodeRecords(input,{indexNonce=''}={}){
  const nodes=new Map();
  const put=node=>{const hash=digest(node);nodes.set(hash,node);return hash;};
  const sequence=(items,kind,nonce='')=>{
    const identity=nonce?{nonce}:{};
    if(items.length<=PAGE_SIZE)return put({kind,items,...identity});
    const pages=[];for(let i=0;i<items.length;i+=PAGE_SIZE)pages.push(sequence(items.slice(i,i+PAGE_SIZE),kind,nonce));
    const group=list=>{
      if(list.length<=PAGE_SIZE)return put({kind:'pages',type:kind,items:list,...identity});
      const parents=[];for(let i=0;i<list.length;i+=PAGE_SIZE)parents.push(group(list.slice(i,i+PAGE_SIZE)));
      return group(parents);
    };
    return group(pages);
  };
  const encode=(value,key='')=>{
    if(typeof value==='string'&&value.length>RECORD_CHARS){
      const parts=[];for(let i=0;i<value.length;i+=RECORD_CHARS)parts.push(put({kind:'value',value:value.slice(i,i+RECORD_CHARS)}));
      return sequence(parts,'text');
    }
    if(Array.isArray(value))return sequence(value.map(item=>encode(item,'item')),'array',['stories','scripts','categories','themes','scriptDrafts'].includes(key)?indexNonce:'');
    if(value&&typeof value==='object'){
      const container=['','state','syncMeta','base','recovery'].includes(key);
      const entity=Object.hasOwn(value,'chapters')||Object.hasOwn(value,'sourceContent');
      if(container||entity||canonical(value).length>RECORD_CHARS){
        const entries=Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,encode(v,k)]);
        if(entries.length>PAGE_SIZE)return put({kind:'dictionary',partial:container,index:sequence(entries.map(([name,child])=>put({kind:'entry',name,child})),'array')});
        return put({kind:'object',partial:container,entries});
      }
    }
    return put({kind:'value',value:value??null});
  };
  return {root:encode(input),nodes};
}
export async function decodeRecords(root,read,hashNode=digest){
  const cache=new Map(),nodes=new Set(),issues=[];
  const decode=async(hash,depth=0,chain=new Set())=>{
    if(depth>80||!hashPattern.test(hash)||chain.has(hash))return {complete:false};
    if(cache.has(hash))return cache.get(hash);
    const work=(async()=>{
      nodes.add(hash);let node;
      try{node=await read(hash);if(await hashNode(node)!==hash)throw Error();}
      catch{issues.push({stage:'record',hash});return {complete:false};}
      const next=new Set(chain);next.add(hash);
      if(node.kind==='value')return {value:node.value,complete:true};
      if(node.kind==='entry'&&typeof node.name==='string'&&!['__proto__','constructor','prototype'].includes(node.name)){
        const result=await decode(node.child,depth+1,next);return {value:result.value===undefined?undefined:[node.name,result.value],complete:result.complete};
      }
      if(node.kind==='dictionary'){
        const result=await decode(node.index,depth+1,next);
        return {value:(result.complete||node.partial)&&Array.isArray(result.value)?Object.fromEntries(result.value):undefined,complete:result.complete};
      }
      if(node.kind==='object'&&Array.isArray(node.entries)&&node.entries.length<=PAGE_SIZE){
        const value={},results=[];
        for(const [key,child] of node.entries){
          if(typeof key!=='string'||['__proto__','constructor','prototype'].includes(key))return {complete:false};
          const result=await decode(child,depth+1,next);results.push(result);if(result.value!==undefined)value[key]=result.value;
        }
        const complete=results.every(r=>r.complete);return {value:complete||node.partial?value:undefined,complete};
      }
      if(['array','text','pages','links'].includes(node.kind)&&Array.isArray(node.items)&&node.items.length<=PAGE_SIZE){
        const results=[];for(const child of node.items)results.push(await decode(child,depth+1,next));
        const complete=results.every(r=>r.complete),values=results.filter(r=>r.value!==undefined).map(r=>r.value);
        if(node.kind==='text')return {value:complete?values.join(''):undefined,complete};
        if(node.kind==='pages')return {value:node.type==='text'?(complete?values.join(''):undefined):values.flat(),complete};
        return {value:values,complete};
      }
      issues.push({stage:'structure',hash});return {complete:false};
    })();cache.set(hash,work);return work;
  };
  const result=await decode(root);return {...result,nodes,issues};
}
