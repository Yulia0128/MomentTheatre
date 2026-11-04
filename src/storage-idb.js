// No fallback on quota, I/O, abort or validation errors. Only a TypeError while
// creating a transaction can indicate an unsupported options argument.
export function writeTransaction(db,stores,owner){
  try{
    const tx=db.transaction(stores,'readwrite',{durability:'strict'});
    if(owner)owner.durability=tx.durability==='strict'?'strict':'default';
    return tx;
  }catch(error){
    if(!(error instanceof TypeError))throw error;
    const tx=db.transaction(stores,'readwrite');if(owner)owner.durability='default';return tx;
  }
}
export function readValue(db,store,key){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store),req=tx.objectStore(store).get(key);let result;
    req.onsuccess=()=>{result=req.result;};tx.oncomplete=()=>resolve(result);
    tx.onerror=tx.onabort=()=>reject(Error('资料记录读取失败。'));
  });
}
export function storeKeys(db,store){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store),req=tx.objectStore(store).getAllKeys();let result;
    req.onsuccess=()=>{result=req.result;};tx.oncomplete=()=>resolve(result);
    tx.onerror=tx.onabort=()=>reject(Error('资料索引读取失败。'));
  });
}
export function readValues(db,store,keys){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store),rows=new Map(),table=tx.objectStore(store);
    for(const [id,key] of keys){const request=table.get(key);request.onsuccess=()=>rows.set(id,request.result);}
    tx.oncomplete=()=>resolve(rows);tx.onerror=tx.onabort=()=>reject(Error('资料记录读取失败。'));
  });
}
export function completeTransaction(tx){
  return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(Error('保存失败，原有效版本仍保留。'));});
}
