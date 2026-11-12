// Same-page serialization also covers runtimes without the Web Locks API.
// Only an actual Web Lock proves exclusion across cooperating pages.
const factories=new WeakMap();
export async function libraryWriteLock(owner,run,{ifAvailable=false}={}){
  let queues=factories.get(owner.factory);
  if(!queues){queues=new Map();factories.set(owner.factory,queues);}
  const name=JSON.stringify(['shunxi-write-v1',owner.databaseName,owner.scope]);
  if(ifAvailable&&queues.has(name))return {acquired:false};
  const previous=queues.get(name)||Promise.resolve();
  let release;const gate=new Promise(resolve=>{release=resolve;});
  queues.set(name,gate);
  await previous;
  try{
    if(owner.locks?.request){
      return await owner.locks.request(name,{mode:'exclusive',ifAvailable},async lock=>{
        if(!lock)return {acquired:false};
        return {acquired:true,value:await run(true)};
      });
    }
    return {acquired:true,value:await run(false)};
  }finally{release();if(queues.get(name)===gate)queues.delete(name);}
}
