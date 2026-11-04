import {storageCalculation} from './storage-compute.js';
self.onmessage=({data})=>{
  try{self.postMessage({id:data.id,value:storageCalculation(data.kind,data.value)});}
  catch(error){self.postMessage({id:data.id,error:error.message?.includes('512 MB')?error.message:'资料计算失败，原有效版本仍保留。'});}
};
