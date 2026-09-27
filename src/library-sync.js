import {emptyState,normalizeState,clone,id} from './model.js';
import {canonical,sha256} from './sync-integrity.js';

export const LOCAL_SETTINGS = ['launcher','launcherEnabled','character','persona','books','bookCharacter','stickerDraft'];
export const equalSync = (a,b) => canonical(a) === canonical(b);
export function sharedState(state) {
  const clean = normalizeState(state);
  for (const key of LOCAL_SETTINGS) delete clean.settings[key];
  return Object.fromEntries(['schemaVersion','themeCatalogVersion','settings','stories','categories','themes','draft'].map(key => [key,clean[key]]));
}
export function applyShared(local,shared) {
  const settings = {...shared.settings};
  for (const key of LOCAL_SETTINGS) settings[key] = clone(local.settings[key]);
  return normalizeState({...shared,settings,errors:local.errors,editorDraft:local.editorDraft});
}
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
function mergeValue(base,local,remote) {
  if (equalSync(local,remote) || equalSync(remote,base)) return clone(local);
  if (equalSync(local,base)) return clone(remote);
  if (plain(local) && plain(remote)) {
    return Object.fromEntries([...new Set([...Object.keys(remote),...Object.keys(local)])].filter(k=>!['__proto__','constructor','prototype'].includes(k)).flatMap(k=>{
      const value=mergeValue(base?.[k],local[k],remote[k]);return value===undefined?[]:[[k,value]];
    }));
  }
  if (Array.isArray(local) && Array.isArray(remote) && [...local,...remote].every(v=>typeof v==='string')) return [...new Set([...local,...remote])];
  return clone(local === undefined ? remote : local);
}
// Reject incomplete/future/lossy payloads instead of normalizing them into an empty library.
export function validateShared(raw) {
  if(!plain(raw)||raw.schemaVersion!==1||raw.themeCatalogVersion!==1||!plain(raw.settings)||!plain(raw.draft)||!['stories','categories','themes'].every(k=>Array.isArray(raw[k])))throw new Error('同步资料不完整或版本不支持，已有资料未覆盖。');
  const clean=sharedState(raw);
  if(!equalSync(raw,clean))throw new Error('同步资料存在缺失、超限或无效内容，已停止合并，已有资料未覆盖。');
  return clean;
}
export function mergeShared(base,local,remote) {
  validateShared(local);if(!remote)return {state:clone(local),conflicts:[]};validateShared(remote);
  base ||= sharedState(emptyState());
  const conflicts=[];
  const entities = field => {
    const b=new Map((base[field]||[]).map(x=>[x.id,x])),result=new Map(local[field].map(x=>[x.id,clone(x)]));
    for(const right of remote[field]){
      const left=result.get(right.id),old=b.get(right.id);
      // Absence never propagates deletion. Recovery is preferred to guessing intent.
      if(!left){result.set(right.id,clone(right));continue;}
      if(equalSync(left,right)||equalSync(right,old))continue;
      if(equalSync(left,old)){result.set(right.id,clone(right));continue;}
      const copy=clone(right);copy.id=(field==='themes'?'custom-sync-':'sync-')+sha256(field+canonical(right)).slice(0,48);
      if(!result.has(copy.id)){
        if(field==='stories'){copy.title=(copy.title||'番外').slice(0,100)+' · 同步副本';copy.syncConflict=true;}
        else copy.name=(copy.name||'未命名').slice(0,field==='themes'?50:90)+' · 同步副本';
        result.set(copy.id,copy);conflicts.push({field,id:copy.id});
      }
    }
    return [...result.values()];
  };
  const state={schemaVersion:1,themeCatalogVersion:1,settings:mergeValue(base.settings,local.settings,remote.settings),stories:entities('stories'),themes:entities('themes'),categories:entities('categories'),draft:mergeValue(base.draft,local.draft,remote.draft)};
  const stickerMap=rows=>{
    const map=new Map();
    for(const original of rows||[]){
      let item=clone(original);
      if(map.has(item.name)&&!equalSync(map.get(item.name),item))item.name=item.name.slice(0,55)+' · 副本 '+sha256(canonical(item)).slice(0,10);
      map.set(item.name,item);
    }
    return map;
  };
  const bs=stickerMap(base.settings.stickers),stickers=stickerMap(clone(local.settings.stickers));
  for(const right of stickerMap(remote.settings.stickers).values()){
    const left=stickers.get(right.name),old=bs.get(right.name);
    if(!left||equalSync(left,old)){stickers.set(right.name,clone(right));continue;}
    if(equalSync(left,right)||equalSync(right,old))continue;
    const copy={...right,name:right.name.slice(0,55)+' · 副本 '+sha256(canonical(right)).slice(0,10)};
    if(!stickers.has(copy.name)){stickers.set(copy.name,copy);conflicts.push({field:'stickers',id:copy.name});}
  }
  state.settings.stickers=[...stickers.values()];
  if(!equalSync(local.draft,remote.draft)&&!equalSync(local.draft,base.draft)&&!equalSync(remote.draft,base.draft)&&remote.draft.prompt){
    const key='sync-'+sha256('prompt'+canonical(remote.draft)).slice(0,48);
    if(!state.stories.some(s=>s.id===key)){
      // Fixed timestamps keep retries deterministic; this is a recovered prompt, not a generated work.
      state.stories.push(sharedState({...emptyState(),stories:[{id:key,title:'同步保留的番外设定',prompt:remote.draft.prompt,mode:remote.draft.mode,chapters:[],categoryIds:[],tags:[],saved:false,syncConflict:true,createdAt:1,updatedAt:1}]}).stories[0]);
      conflicts.push({field:'stories',id:key});
    }
  }
  const clean=validateShared(state);
  return {state:clean,conflicts};
}

export class LibrarySync {
  constructor({store,remote,getState,prepare=async()=>{},canApply=()=>true,apply,onStatus=()=>{},onError=()=>{}}) {
    Object.assign(this,{store,remote,getState,prepare,canApply,apply,onStatus,onError});this.disposed=false;this.running=null;
    this.status={kind:'idle',text:'由你手动上传或下载，同步前会保留一份本机备份。'};
  }
  setStatus(kind,text){this.status={kind,text};this.onStatus(this.status);}
  run(direction){
    if(this.disposed||this.running)return this.running;
    this.running=this.perform(direction).finally(()=>{this.running=null;this.onStatus(this.status);});return this.running;
  }
  async perform(direction){
    try{
      if(!['upload','download'].includes(direction))throw new Error('请选择上传或下载。');
      if(!this.canApply())throw new Error('请先结束生成或编辑，再手动同步。');
      this.setStatus('syncing',direction==='upload'?'正在合并并上传…':'正在下载并合并…');
      await this.prepare();
      const local=sharedState(this.getState()),guard={expectedRevision:this.store.revision,expectedSequence:this.store.sequence};
      const record=await this.remote.pull();
      const check=()=>{if(this.disposed||!this.canApply()||!equalSync(sharedState(this.getState()),local)||guard.expectedRevision!==this.store.revision||guard.expectedSequence!==this.store.sequence)throw new Error('同步期间本机资料发生变化，已停止操作，请重新同步。');};
      check();
      if(direction==='download'&&!record.state){this.setStatus('idle','服务器还没有同步资料，请先在有资料的设备上传。');return;}
      const merged=mergeShared(this.store.syncMeta?.base,local,record.state);
      // Commit recovery + merged state atomically BEFORE publishing. Failed persistence
      // cannot publish an incomplete library, nor replace the application's live state.
      await this.apply(merged.state,{base:record.state},guard);
      if(this.disposed)return;
      let result=record;
      if(direction==='upload'){
        const publishedGuard={expectedRevision:this.store.revision,expectedSequence:this.store.sequence};
        const stillCurrent=()=>!this.disposed&&this.canApply()&&publishedGuard.expectedRevision===this.store.revision&&publishedGuard.expectedSequence===this.store.sequence&&equalSync(sharedState(this.getState()),merged.state);
        result=await this.remote.push(record,merged.state,stillCurrent);
        if(!stillCurrent())throw new Error('服务器快照已保留，本机随后有新修改，请再次同步。');
        await this.store.save(this.getState(),{syncMeta:{base:merged.state,lastUpload:result.current},...publishedGuard});
      }
      this.setStatus('done',(direction==='upload'?'已上传到服务器':'已下载并合并')+(merged.conflicts.length?' · 已保留 '+merged.conflicts.length+' 份冲突副本':'')+' · '+new Date().toLocaleTimeString('zh-CN'));
    }catch(error){
      if(!this.disposed){this.setStatus('error',(error.message||'同步失败')+' 本机资料仍保留。');this.onError(error);}
    }
  }
  dispose(){this.disposed=true;}
}
