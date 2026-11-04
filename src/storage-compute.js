import {packAvatars,avatarHash} from './avatar-assets.js';
import {encodeRecords,canonicalEqual,digest} from './storage-records.js';

// Pure calculations only: workers never open the database or confirm a version.
export function storageCalculation(kind,value){
  if(kind==='equal')return canonicalEqual(value.a,value.b);
  if(kind==='digest')return digest(value);
  if(kind==='assets')return [...value].filter(([hash,url])=>typeof url==='string'&&avatarHash(url)===hash).map(([hash])=>hash);
  if(kind!=='prepare')throw Error('未知资料计算。');
  const packed=packAvatars(value.input,{knownUrls:value.knownImages}),encoded=encodeRecords(packed.data,{indexNonce:value.token});
  let size=0;const bytes=text=>new TextEncoder().encode(text).length;
  for(const node of encoded.nodes.values())size+=bytes(JSON.stringify(node));
  for(const url of packed.assets.values())size+=bytes(url);
  if(size>512*1024*1024)throw Error('本机候选资料超过 512 MB，已停止保存，原有效版本仍保留。');
  return {encoded,assets:packed.assets,size};
}

export class StorageCompute {
  constructor(){this.pending=new Map();this.sequence=0;this.mode='unused';this.closed=false;}
  run(kind,value){
    if(this.closed)return Promise.reject(Error('资料计算已关闭。'));
    if(this.mode==='fallback')return Promise.resolve().then(()=>storageCalculation(kind,value));
    return new Promise((resolve,reject)=>{
      const key=++this.sequence;this.pending.set(key,{resolve,reject,kind,value});
      try{
        if(!this.worker){
          if(typeof Worker==='undefined')throw Error('Worker unavailable');
          if(typeof __SHUNXI_STORAGE_WORKER__!=='undefined'){
            this.url=URL.createObjectURL(new Blob([__SHUNXI_STORAGE_WORKER__],{type:'text/javascript'}));
            this.worker=new Worker(this.url);
          }else this.worker=new Worker(new URL('./storage-worker.js',import.meta.url),{type:'module'});
          this.worker.onmessage=({data})=>{
            const task=this.pending.get(data.id);if(!task)return;this.pending.delete(data.id);this.mode='worker';
            if(data.error)task.reject(Error(data.error));else task.resolve(data.value);
          };
          this.worker.onerror=event=>{event.preventDefault?.();this.fallback();};
          this.worker.onmessageerror=()=>this.fallback();
        }
        this.worker.postMessage({id:key,kind,value});
      }catch{this.fallback();}
    });
  }
  fallback(){
    this.worker?.terminate();this.worker=null;if(this.url){URL.revokeObjectURL(this.url);this.url=null;}this.mode='fallback';
    for(const [id,task] of this.pending){this.pending.delete(id);Promise.resolve().then(()=>storageCalculation(task.kind,task.value)).then(task.resolve,task.reject);}
  }
  close(){
    this.closed=true;this.worker?.terminate();this.worker=null;if(this.url){URL.revokeObjectURL(this.url);this.url=null;}
    for(const task of this.pending.values())task.reject(Error('资料计算已关闭。'));this.pending.clear();
  }
}
