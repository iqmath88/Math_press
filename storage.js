'use strict';
const MPStore=(()=>{
 const journalKey='mathpress-recovery-v2:'+location.pathname.replace(/index\.html$/,'');
 const activeKey=journalKey+':active';
 function db(){return new Promise((ok,no)=>{const r=indexedDB.open('mathpress-local',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('documents'))r.result.createObjectStore('documents',{keyPath:'id'});};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);r.onblocked=()=>no(Error('التخزين مشغول'));});}
 async function store(mode,fn){const d=await db();try{return await new Promise((ok,no)=>{const t=d.transaction('documents',mode);const r=fn(t.objectStore('documents'));t.oncomplete=()=>ok(r.result);t.onerror=()=>no(t.error);t.onabort=()=>no(t.error);});}finally{d.close();}}
 function journal(d){try{localStorage.setItem(journalKey,JSON.stringify(d));localStorage.setItem(activeKey,d.id);return true;}catch{return false;}}
 function recovered(){try{const d=JSON.parse(localStorage.getItem(journalKey));return MP.valid(d)?d:null;}catch{return null;}}
 function active(){try{return localStorage.getItem(activeKey);}catch{return null;}}
 function clear(d){try{const r=recovered();if(r&&r.id===d.id&&r.updatedAt===d.updatedAt&&JSON.stringify(r)===JSON.stringify(d))localStorage.removeItem(journalKey);}catch{}}
 function forget(id){try{if(recovered()?.id===id)localStorage.removeItem(journalKey);if(active()===id)localStorage.removeItem(activeKey);}catch{}}
 return {store,journal,recovered,active,clear,forget};
})();
