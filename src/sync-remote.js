import {id} from './model.js';
import {validateShared} from './library-sync.js';
import {canonical,sha256} from './sync-integrity.js';

export const SYNC_INDEX='momenttheatre-sync-v1.json';
export const SYNC_LIMIT=50000000;
const snapshotName=/^momenttheatre-sync-[a-zA-Z0-9_-]{16,100}\.json$/;
const fail=message=>{throw new Error(message);};
const encode=text=>{const bytes=new TextEncoder().encode(text);let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);};
export function packSnapshot(state){
  validateShared(state);
  const value={format:'momenttheatre-library',version:1,createdAt:new Date().toISOString(),state,checksum:sha256(canonical(state))};
  if(new TextEncoder().encode(JSON.stringify(value)).length>SYNC_LIMIT)fail('同步资料超过 50 MB，请先导出完整备份。');
  return value;
}
export function unpackSnapshot(value){
  if(value?.format!=='momenttheatre-library'||value.version!==1||typeof value.checksum!=='string'||sha256(canonical(value.state)||'')!==value.checksum)fail('服务器快照校验失败，已停止同步。');
  return validateShared(value.state);
}
function validateIndex(value){
  if(value?.format!=='momenttheatre-index'||value.version!==1||!snapshotName.test(value.current)||!Array.isArray(value.history)||value.history.length>5||!value.history.every(x=>snapshotName.test(x)))fail('服务器同步索引损坏或版本不支持，已停止同步。');
  return value;
}
// SillyTavern 1.18.0: src/endpoints/files.js + src/users.js. These native
// account-scoped routes need no server plugin. They provide no compare-and-swap.
export class ServerLibrary {
  constructor(getHeaders,fetcher=globalThis.fetch){this.getHeaders=getHeaders;this.fetcher=fetcher.bind(globalThis);}
  async request(url,body){
    const response=await this.fetcher(url,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{...this.getHeaders(),'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
    return response;
  }
  async readJSON(response,limit=SYNC_LIMIT){
    if(Number(response.headers?.get('content-length'))>limit)fail('服务器同步文件过大，已停止读取。');
    let raw;
    if(response.body?.getReader){
      const reader=response.body.getReader(),decoder=new TextDecoder();let size=0;const chunks=[];
      try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();fail('服务器同步文件过大，已停止读取。');}chunks.push(decoder.decode(value,{stream:true}));}chunks.push(decoder.decode());raw=chunks.join('');}
      finally{reader.releaseLock();}
    }else{raw=await response.text();if(new TextEncoder().encode(raw).length>limit)fail('服务器同步文件过大，已停止读取。');}
    try{return JSON.parse(raw);}catch{fail('服务器未返回有效同步文件，已停止操作。');}
  }
  async read(name,allowMissing=false){
    if(name!==SYNC_INDEX&&!snapshotName.test(name))fail('同步文件路径不正确。');
    const response=await this.request('/user/files/'+name);
    if(response.status===404&&allowMissing){
      const path='user/files/'+name,verify=await this.request('/api/files/verify',{urls:[path]});
      if(!verify.ok)fail('无法确认服务器同步文件状态，请稍后再试。');
      const result=await this.readJSON(verify,10000);
      if(result?.[path]===false)return null;
      fail('服务器文件读取异常，未覆盖同步索引。');
    }
    if(!response.ok)fail('读取服务器资料失败：HTTP '+response.status);
    return this.readJSON(response,name===SYNC_INDEX?10000:SYNC_LIMIT);
  }
  async write(name,value){
    const response=await this.request('/api/files/upload',{name,data:encode(JSON.stringify(value))});
    if(!response.ok)fail('上传失败：HTTP '+response.status+'，服务器旧快照仍保留。');
    const result=await this.readJSON(response,10000);
    if(String(result?.path||'').replace(/^\//,'')!=='user/files/'+name)fail('服务器返回的文件位置异常，已停止发布。');
  }
  async index(){const result=await this.read(SYNC_INDEX,true);return result===null?null:validateIndex(result);}
  async pull(){
    const index=await this.index();if(!index)return {index:null,current:null,state:null};
    return {index,current:index.current,state:unpackSnapshot(await this.read(index.current))};
  }
  async push(record,state,stillCurrent=()=>true){
    const name='momenttheatre-sync-'+id()+'.json',snapshot=packSnapshot(state);
    if(!stillCurrent())fail('本机资料已变化，上传停止。');
    await this.write(name,snapshot);
    const readback=await this.read(name);unpackSnapshot(readback);
    if(readback.checksum!==snapshot.checksum)fail('上传校验不一致，服务器旧索引未覆盖。');
    if(!stillCurrent())fail('本机资料已变化，独立快照已保留，旧索引未覆盖。');
    if(canonical(await this.index())!==canonical(record.index))fail('另一设备刚刚上传了资料，请重新同步；本次快照已保留。');
    if(!stillCurrent())fail('本机资料已变化，旧索引未覆盖。');
    const index={format:'momenttheatre-index',version:1,current:name,history:[...new Set([record.current,...(record.index?.history||[])].filter(Boolean))].slice(0,5)};
    await this.write(SYNC_INDEX,index);
    if(canonical(await this.index())!==canonical(index))fail('发现同时上传，请逐台重新同步；双方独立快照仍保留。');
    return {index,current:name,state};
  }
}
