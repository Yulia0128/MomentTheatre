// Foreground scheduling only. The existing sync engine owns merge/commit safety.
export class AutoSync {
  constructor({sync,enabled,active,idle,dirty,onStatus=()=>{},setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),now=Date.now,delay=8000,poll=60000}) {
    Object.assign(this,{sync,enabled,active,idle,dirty,onStatus,setTimer,clearTimer,now,delay,poll});
    this.epoch=0;this.failures=0;this.retryAt=0;this.disposed=false;this.text='';
  }
  status(text){this.text=text;this.onStatus();}
  isDirty(){try{return this.dirty();}catch{return true;}}
  plan(delay){
    this.clearTimer(this.timer);
    if(!this.disposed&&this.enabled()&&this.active())this.timer=this.setTimer(()=>this.tick(),Math.max(delay,this.retryAt-this.now()));
  }
  wake(){this.epoch++;this.retryAt=0;this.plan(this.delay);}
  pause(){this.epoch++;this.clearTimer(this.timer);}
  activity(){this.epoch++;this.plan(this.delay);}
  changed(){if(this.enabled())this.status('有修改尚未同步 · 本机保存并空闲后自动同步。');}
  saved(){
    if(this.disposed||!this.enabled()||this.sync.running)return;
    if(this.isDirty()){
      if(!this.failures)this.status('有修改尚未同步 · 空闲后自动同步。');
      this.plan(this.delay);
    }
  }
  async tick(){
    if(this.disposed||!this.enabled()||!this.active())return;
    if(!this.idle()||this.sync.running){
      if(this.isDirty())this.status('有修改尚未同步 · 生成或编辑结束并空闲后同步。');
      this.plan(this.delay);return;
    }
    if(this.retryAt>this.now()){this.plan(this.retryAt-this.now());return;}
    const epoch=this.epoch;
    this.status('正在自动同步…');
    const result=await this.sync.run('upload',{automatic:true,allowed:()=>!this.disposed&&this.enabled()&&this.active()&&this.idle()&&epoch===this.epoch});
    if(this.disposed||!this.enabled())return;
    if(result?.ok){
      this.failures=0;this.retryAt=0;this.status(this.sync.status.text);this.plan(this.poll);
    }else if(result?.deferred||epoch!==this.epoch||!this.active()){
      this.status(this.isDirty()?'有修改尚未同步 · 空闲后自动同步。':'空闲后检查服务器更新。');this.plan(this.delay);
    }else{
      this.failures++;this.retryAt=this.now()+Math.min(300000,15000*2**Math.min(this.failures-1,5));
      this.status((this.isDirty()?'有修改尚未同步 · ':'')+'自动同步失败，将稍后重试。本机资料仍保留。');this.plan(this.delay);
    }
  }
  dispose(){this.disposed=true;this.pause();}
}
