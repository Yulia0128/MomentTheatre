import {emptyState,normalizeState,id} from './model.js';
import {packAvatars,unpackAvatars,avatarReferences,avatarHash} from './avatar-assets.js';
import {encodeRecords,decodeRecords,seal,unseal,canonicalEqual,digest} from './storage-records.js';
import {writeTransaction,readValue,storeKeys,completeTransaction} from './storage-idb.js';

export const VERSION_STORES=['accounts','avatars','libraryRecords','libraryVersions','libraryCommits'];
const conflict=()=>Error('另一页面已修改资料或同步期间出现新输入，本次保存失败；原有效版本仍保留。');
export class LibraryVersions {
  constructor(owner){this.owner=owner;this.current=null;this.previous=null;this.legacyRefs=new Set();}
  get db(){return this.owner.db;}
  get scope(){return this.owner.scope;}
  get headKey(){return [this.scope,'v3-head'];}
  health(kind,issues=[]){this.owner.health={kind,writable:kind==='healthy',issues:issues.map(x=>({stage:x.stage||'integrity'}))};try{this.owner.onHealth?.(this.owner.health);}catch{/* UI notification cannot change storage integrity. */}}
  async keys(store){return (await storeKeys(this.db,store)).filter(key=>Array.isArray(key)&&key[0]===this.scope);}
  async version(token){
    const manifest=unseal(await readValue(this.db,'libraryVersions',[this.scope,token]));
    if(manifest.version!==1||manifest.token!==token||!Number.isSafeInteger(manifest.revision)||manifest.revision<1)throw Error('资料版本结构无效。');
    const decoded=await decodeRecords(manifest.root,hash=>readValue(this.db,'libraryRecords',[this.scope,hash]));
    if(!decoded.value?.state)throw Error('资料主信息不可用。');
    const refs=avatarReferences(decoded.value),assets=new Map(),issues=[...decoded.issues];
    for(const hash of refs){
      try{const url=await readValue(this.db,'avatars',[this.scope,hash]);if(typeof url!=='string'||avatarHash(url)!==hash)throw Error();assets.set(hash,url);}
      catch{issues.push({stage:'resource'});}
    }
    const complete=decoded.complete&&issues.length===0;
    const value=unpackAvatars(decoded.value,assets,{allowMissing:!complete});
    const state=normalizeState(value.state);
    return {token,manifest,value,state,nodes:decoded.nodes,refs,assets,complete,issues};
  }
  async load(){
    this.owner.health={kind:'loading',writable:false,issues:[]};this.current=null;this.previous=null;
    let head,headBad=false;
    try{const raw=await readValue(this.db,'accounts',this.headKey);if(raw)head=unseal(raw);}catch{headBad=true;}
    const receipts=[];let receiptsBad=false;
    for(const key of await this.keys('libraryCommits')){
      try{const row=unseal(await readValue(this.db,'libraryCommits',key));if(row.token!==key[1]||!Number.isSafeInteger(row.revision))throw Error();receipts.push(row);}
      catch{receiptsBad=true;}
    }
    receipts.sort((a,b)=>b.revision-a.revision);
    if(!head&&!headBad&&!receipts.length&&!receiptsBad){
      if((await this.keys('libraryVersions')).length)throw Error('检测到未确认资料版本，已停止初始化，原记录保留。');
      const legacy=await readValue(this.db,'accounts',this.scope);
      if(!legacy){
        const recovery=await this.owner.decodeRow(await readValue(this.db,'accounts',this.scope+':sync-recovery'));
        if(recovery?.state){this.owner.revision=recovery.revision||0;this.owner.syncMeta=null;this.health('rollback',[{stage:'legacy-primary'}]);return normalizeState(recovery.state);}
        if((await this.keys('libraryRecords')).length||(await this.keys('avatars')).length)throw Error('检测到孤立资料记录，已停止初始化，原记录保留。');
        this.owner.revision=0;this.health('healthy');return emptyState();
      }
      const row=await this.owner.decodeRow(legacy);
      const recoveryRaw=await readValue(this.db,'accounts',this.scope+':sync-recovery');
      const recovery=await this.owner.decodeRow(recoveryRaw);
      this.legacyRefs=new Set([...avatarReferences(legacy),...avatarReferences(recoveryRaw)]);
      const state=normalizeState(row.state);this.owner.revision=legacy.revision||0;this.owner.syncMeta=row.syncMeta||null;
      this.owner.migratedFrom={revision:legacy.revision||0,writer:legacy.writer,sequence:legacy.sequence||0};
      this.health('healthy');
      await this.commit(state,{syncMeta:row.syncMeta||null,recoveryValue:recovery?.state||null,sequence:this.owner.sequence,epoch:this.owner.syncEpoch,migration:true});
      return state;
    }
    // Retained legacy rows may still own separate assets. Never collect those.
    for(const key of [this.scope,this.scope+':sync-recovery']){
      try{for(const hash of avatarReferences(await readValue(this.db,'accounts',key)))this.legacyRefs.add(hash);}catch{headBad=true;}
    }
    const ordered=[...new Set([head?.current,head?.previous,...receipts.map(r=>r.token)].filter(Boolean))];
    let partial=null,chosen=null;
    for(const token of ordered){
      const receipt=receipts.find(r=>r.token===token);
      try{
        const version=await this.version(token);
        const witnessed=receipt&&receipt.root===version.manifest.root&&receipt.revision===version.manifest.revision;
        if(!witnessed&&token!==head?.current&&token!==head?.previous)throw Error();
        if(version.complete){chosen=version;break;}
        partial ||= version;
      }catch{/* Each version is checked separately; the bad version remains untouched. */}
    }
    chosen ||= partial;
    if(!chosen){
      const legacy=await this.owner.decodeRow(await readValue(this.db,'accounts',this.scope));
      if(legacy?.state){this.health('rollback',[{stage:'migration'}]);this.owner.revision=legacy.revision||0;this.owner.syncMeta=legacy.syncMeta||null;return normalizeState(legacy.state);}
      throw Error('保留版本均无法完整读取，原资料未覆盖。请保留现场并使用已有备份。');
    }
    const receipt=receipts.find(r=>r.token===chosen.token);
    const currentIsGood=chosen.complete&&head?.current===chosen.token&&head.revision===chosen.manifest.revision&&receipt?.root===chosen.manifest.root&&!head.pending&&!headBad&&!receiptsBad;
    this.health(currentIsGood?'healthy':chosen.complete?'rollback':'partial',chosen.issues.length?chosen.issues:[{stage:'version'}]);
    this.current=chosen;this.owner.revision=chosen.manifest.revision;this.owner.syncMeta=chosen.value.syncMeta||null;
    if(head?.previous&&head.previous!==chosen.token){try{this.previous=await this.version(head.previous);if(!this.previous.complete&&chosen.complete)this.health('rollback',[{stage:'previous'}]);}catch{if(chosen.complete)this.health('rollback',[{stage:'previous'}]);}}
    this.owner.knownAssets=new Set(chosen.refs);this.owner.knownImages=new Map([...chosen.assets].map(([hash,url])=>[url,hash]));
    return chosen.state;
  }
  guard(options){
    const o=this.owner;
    if(!o.health.writable)throw Error('资料正在保护性只读，不能保存或同步。');
    if(options.epoch!==o.syncEpoch)throw Error('同步后资料已更新，已阻止旧的待保存内容覆盖合并结果。');
    if(options.expectedRevision!=null&&options.expectedRevision!==o.revision||options.expectedSequence!=null&&options.expectedSequence!==o.sequence)throw conflict();
  }
  async stage(manifest,encoded,assets,options){
    this.guard(options);const o=this.owner,tx=writeTransaction(this.db,VERSION_STORES,o),done=completeTransaction(tx);
    if(options.expectedRevision!=null)o.activeSync=tx;
    const accounts=tx.objectStore('accounts'),request=accounts.get(this.headKey);
    const readFailure=()=>{options.readFailed=true;};request.onerror=readFailure;
    const start=legacy=>{
      try{
        this.guard(options);let head;
        try{head=request.result?unseal(request.result):null;}catch(error){options.readFailed=true;throw error;}
        if((head?.revision??legacy?.revision??0)!==o.revision||head?.pending)throw conflict();
        accounts.put(seal({version:1,revision:o.revision,current:head?.current||null,previous:head?.previous||null,pending:manifest.token}),this.headKey);
        tx.objectStore('libraryVersions').put(seal(manifest),[this.scope,manifest.token]);
        const writeMissing=(name,hash,value,expected)=>{
          const store=tx.objectStore(name),r=store.get([this.scope,hash]);r.onerror=readFailure;
          r.onsuccess=()=>{if(r.result!==undefined)return;if(expected){options.readFailed=true;options.error=Error('已确认资料记录缺失，已停止保存并保留现场。');tx.abort();}else store.put(value,[this.scope,hash]);};
        };
        for(const [hash,node] of encoded.nodes)writeMissing('libraryRecords',hash,node,this.current?.nodes.has(hash));
        for(const [hash,url] of assets)writeMissing('avatars',hash,url,this.current?.refs.has(hash)||this.legacyRefs.has(hash));
      }catch(error){options.error=error;tx.abort();}
    };request.onsuccess=()=>{
      if(request.result){start(null);return;}
      const legacy=accounts.get(this.scope);legacy.onerror=readFailure;legacy.onsuccess=()=>start(legacy.result);
    };
    try{await done;}catch(error){throw options.error||error;}finally{if(o.activeSync===tx)o.activeSync=null;}
  }
  async confirm(candidate,options){
    this.guard(options);const o=this.owner,tx=writeTransaction(this.db,VERSION_STORES,o),done=completeTransaction(tx);
    if(options.expectedRevision!=null)o.activeSync=tx;
    const rows=tx.objectStore('accounts'),request=rows.get(this.headKey);
    request.onsuccess=()=>{
      try{
        this.guard(options);const head=unseal(request.result);
        if(head.revision!==o.revision||head.pending!==candidate.token||head.current!==(this.current?.token||null))throw conflict();
        const next={version:1,revision:candidate.manifest.revision,current:candidate.token,previous:head.current,pending:null};
        rows.put(seal(next),this.headKey);
        tx.objectStore('libraryCommits').put(seal(candidate.manifest),[this.scope,candidate.token]);
        const versions=new Set([candidate.token,head.current].filter(Boolean));
        const nodes=new Set([...candidate.nodes,...(this.current?.nodes||[])]),refs=new Set([...candidate.refs,...(this.current?.refs||[]),...this.legacyRefs]);
        for(const [name,keep] of [['libraryRecords',nodes],['avatars',refs],['libraryVersions',versions],['libraryCommits',versions]]){
          const store=tx.objectStore(name),cursor=store.openKeyCursor();cursor.onsuccess=()=>{const row=cursor.result;if(!row)return;if(Array.isArray(row.key)&&row.key[0]===this.scope&&!keep.has(row.key[1]))store.delete(row.key);row.continue();};
        }
      }catch(error){options.error=error;tx.abort();}
    };
    try{await done;}catch(error){throw options.error||error;}finally{if(o.activeSync===tx)o.activeSync=null;}
  }
  async verifyRetained(candidate){
    // Shared nodes were just read back as part of the candidate. Check the old
    // version's remaining nodes too, before retiring any other confirmed root.
    for(const hash of this.current?.nodes||[])if(!candidate.nodes.has(hash)){
      if(digest(await readValue(this.db,'libraryRecords',[this.scope,hash]))!==hash)throw Error('保留版本记录缺失或校验失败。');
    }
    for(const hash of this.current?.refs||[])if(!candidate.refs.has(hash)){
      const url=await readValue(this.db,'avatars',[this.scope,hash]);if(typeof url!=='string'||avatarHash(url)!==hash)throw Error('保留版本资源缺失或校验失败。');
    }
  }
  async commit(state,options){
    this.guard(options);const o=this.owner;
    const recovery=options.recoveryValue!==undefined?options.recoveryValue:options.recovery?this.current?.value.state||null:this.current?.value.recovery||null;
    const token=id(),input={state,syncMeta:options.syncMeta||null,recovery},packed=packAvatars(input,{knownUrls:o.knownImages}),encoded=encodeRecords(packed.data,{indexNonce:token});
    let size=0;const bytes=value=>new TextEncoder().encode(value).length;
    for(const node of encoded.nodes.values())size+=bytes(JSON.stringify(node));
    for(const url of packed.assets.values())size+=bytes(url);
    if(size>512*1024*1024)throw Error('本机候选资料超过 512 MB，已停止保存，原有效版本仍保留。');
    o.lastCommitStats={candidateBytes:size,retainedVersions:this.current?2:1};
    const manifest={version:1,token,revision:o.revision+1,writer:o.writer,sequence:options.sequence,root:encoded.root};
    let staged=false;
    try{
      await this.stage(manifest,encoded,packed.assets,options);staged=true;
      const candidate=await this.version(manifest.token);
      if(!candidate.complete||!canonicalEqual(candidate.value,input))throw Error('保存回读校验失败，原有效版本仍保留。');
      await this.verifyRetained(candidate);
      await this.confirm(candidate,options);
      this.previous=this.current;this.current=candidate;o.revision=manifest.revision;o.syncMeta=options.syncMeta||null;o.persistedSequence=options.sequence;
      o.knownAssets=new Set(candidate.refs);o.knownImages=new Map([...candidate.assets].map(([hash,url])=>[url,hash]));
      if(options.expectedRevision!=null)o.syncEpoch++;
      const pending=o.readCheckpoint();if(pending?.writer===o.writer&&pending.sequence<=options.sequence){try{o.journal?.removeItem(o.journalKey);}catch{/* Committed data is already durable to the host's supported level. */}}
      try{o.onSaved?.();}catch{/* Observers cannot invalidate a confirmed transaction. */}
    }catch(error){if(staged||options.readFailed)this.health('pending',[{stage:options.readFailed?'read':'commit'}]);throw error;}
  }
}
