/**
 * db.js v11 — Supabase + caché IndexedDB (offline-first)
 * AutoPuerta Pro
 *
 * Cambios vs v10.2:
 *  - KEY leída de window.SUPABASE_CONFIG (definido en index.html)
 *  - TABLA.partesTrabajo → 'partes_trabajo' (esquema usado por los formularios)
 *  - REN_OUT/REN_IN ampliados: puertaIds, clienteId, tipoPuerta, kmInicial
 *  - REN_IN errata corregida: 'precocompra' → 'precocompra' (columna real en BD es precocompra)
 *  - dbGetAll: reintento sin .order('createdat') si la tabla no tiene la columna
 *  - dbAdd/dbPut: generan id automático si falta (partes venían de autoIncrement)
 *  - seedIfEmpty: protegido con flag localStorage 'autopuerta_seed_hecho'
 *  - Caché IndexedDB real para lectura offline
 *  - window.db expuesto con todas las funciones
 */

// ── Config (definir window.SUPABASE_CONFIG en index.html) ─────
const SUPABASE_URL = (window.SUPABASE_CONFIG || {}).url || 'https://ziimllianelsocrdeeut.supabase.co';
const SUPABASE_KEY = (window.SUPABASE_CONFIG || {}).anon || '';

if (!SUPABASE_KEY.startsWith('eyJ')) {
  console.error('[db.js] ❌ Falta anon key válida. Define window.SUPABASE_CONFIG en index.html.');
}

const supabaseDB = window.sb || window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
window.supabaseDB = supabaseDB;

// ── Mapping store → tabla real ─────────────────────────────
const TABLA = {
  clientes:      'clientes',
  presupuestos:  'presupuestos',
  vehiculos:     'vehiculos',
  almacen:       'almacen',
  tiposPuerta:   'tipos_puerta',
  empleados:     'empleados',
  ubicaciones:   'ubicaciones',
  informes:      'informes',
  puertas:       'puertas',
  revisiones:    'revisiones',
  partesTrabajo: 'partes_trabajo',
  cadenas:       'cadenas',
  rutas:         'rutas',
  articulos:     'articulos',
  jornadas:      'jornadas',
  tableros:      'tableros',
  tarjetasTablero: 'tarjetas_tablero',
  solicitudesMaterial: 'solicitudes_material',
  incidencias: 'incidencias'
};

// ── Renombrado camelCase ↔ snake_case ──────────────────────
const REN_OUT = {
  updatedAt:'updatedat',
  createdAt:'createdat',
  empleadoId:'empleadoid',
  empleadoNombre:'empleadonombre',
  empleadoDni:'empleadodni',
  clienteDni:'clientedni',
  firmaTecnico:'firmatecnico',
  firmaCliente:'firmacliente',
  horaEntrada:'hora_entrada',
  horaSalida:'hora_salida',
  vehiculoId:'vehiculoid',
  ubicacionNombre:'ubicacionnombre',
  ubicacionDireccion:'ubicaciondireccion',
  precioCompra:'preciocompra',
  precioVenta:'precioventa',
  stockMinimo:'stockminimo',
  puertaIds:'puertaids',
  clienteId:'clienteid',
  tecnicoId:'tecnicoid',
  clienteNombre:'clientenombre',
  tipoPuerta:'tipopuerta',
  kmInicial:'km_inicial',
  puertaId:'puertaid',
  boardId:'boardid',
  dueDate:'fechalimite',
  assigneeId:'asignadoid',
  order:'orden',
  ubicacionId:'ubicacionid',
  matriculaAsociada:'matriculaasociada',
  medidasAncho:'medidasancho',
  medidasAlto:'medidasalto',
  anioInstalacion:'anioinstalacion',
  fechaRevision:'fecharevision',
  ultimaRevision:'ultimorevision',
  frecuenciaMeses:'frecuenciameses',
  proximaRevision:'proximarevision',
  estadoTrasRevision:'estadotrasrevision',
  resultadoRev:'resultado',
  observacionesRev:'observaciones',
  // Clientes
  esCadena:'escadena',
  padreId:'padreid',
  cadenaId:'cadenaid',
  rutaId:'rutaid',
  createdBy:'createdby',
  articuloId:'articuloid',
  presupuestoId:'presupuestoid',
  employeeId:'employee_id',
  notaTecnico:'notatecnico',
  resueltaAt:'resueltaat'
};
const REN_IN = {
  updatedat:'updatedAt',
  createdat:'createdAt',
  empleadoid:'empleadoId',
  empleadonombre:'empleadoNombre',
  empleadodni:'empleadoDni',
  clientedni:'clienteDni',
  firmatecnico:'firmaTecnico',
  firmacliente:'firmaCliente',
  hora_entrada:'horaEntrada',
  hora_salida:'horaSalida',
  vehiculoid:'vehiculoId',
  ubicacionnombre:'ubicacionNombre',
  ubicaciondireccion:'ubicacionDireccion',
  precocompra:'precioCompra',
  precioventa:'precioVenta',
  stockminimo:'stockMinimo',
  puertaids:'puertaIds',
  clienteid:'clienteId',
  clientenombre:'clienteNombre',
  tipopuerta:'tipoPuerta',
  km_inicial:'kmInicial',
  puertaid:'puertaId',
  boardid:'boardId',
  fechalimite:'dueDate',
  asignadoid:'assigneeId',
  orden:'order',
  ubicacionid:'ubicacionId',
  matriculaasociada:'matriculaAsociada',
  medidasancho:'medidasAncho',
  medidasalto:'medidasAlto',
  anioinstalacion:'anioInstalacion',
  fecharevision:'fechaRevision',
  ultimorevision:'ultimaRevision',
  frecuenciameses:'frecuenciaMeses',
  proximarevision:'proximaRevision',
  estadotrasrevision:'estadoTrasRevision',
  resultado:'resultadoRev',
  observaciones:'observacionesRev',
  escadena:'escadena',
  padreid:'padreid',
  cadenaid:'cadenaid',
  rutaid:'rutaid',
  createdby:'createdBy',
  articuloid:'articuloId',
  presupuestoid:'presupuestoId',
  employee_id:'employeeId',
  notatecnico:'notaTecnico',
  resueltaat:'resueltaAt'
};

function toDB(obj){
  if(!obj || typeof obj!=='object') return obj;
  const o={};
  for(const[k,v]of Object.entries(obj)){
    o[REN_OUT[k]||k]=v;
  }
  o.updatedat=new Date().toISOString();
  return o;
}

function fromJS(obj){
  if(!obj || typeof obj!=='object') return obj;
  const o={};
  for(const[k,v]of Object.entries(obj)){
    o[REN_IN[k]||k]=v;
  }
  return o;
}

function fromJSArray(rows){
  return Array.isArray(rows) ? rows.map(fromJS) : rows;
}

// ── Generador de IDs legibles ──────────────────────────────
function nextId(prefix){
  return prefix + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase();
}

// ── Caché IndexedDB (lectura offline) ──────────────────────
const CACHE_DB='autopuerta_cache', CACHE_STORE='cache', TTL=5*60_000;
let _cdb=null;

function openCache(){
  return new Promise((res,rej)=>{
    if(_cdb) return res(_cdb);
    const r=indexedDB.open(CACHE_DB,1);
    r.onupgradeneeded=e=>e.target.result.createObjectStore(CACHE_STORE);
    r.onsuccess=e=>{_cdb=e.target.result;res(_cdb);};
    r.onerror=e=>{rej(r.error);};
  });
}

async function cacheReadEntry(store){
  try{
    const db=await openCache();
    return await new Promise(res=>{
      const rq=db.transaction(CACHE_STORE).objectStore(CACHE_STORE).get(store);
      rq.onsuccess=()=>res(rq.result||null);
      rq.onerror=()=>res(null);
    });
  }catch(e){ return null; }
}

async function cacheRead(store,allowStale=false){
  const entry=await cacheReadEntry(store);
  if(!entry || entry.data===null) return null;
  if(!allowStale && (entry.complete===false || Date.now()-entry.ts>=TTL)) return null;
  return entry.data;
}

async function cacheWrite(store,data,complete=data!==null){
  try{
    const db=await openCache();
    const tx=db.transaction(CACHE_STORE,'readwrite');
    tx.objectStore(CACHE_STORE).put({data,ts:Date.now(),complete},store);
    return new Promise(res=>{tx.oncomplete=()=>res(true);tx.onerror=()=>res(false);});
  }catch(e){ return false; }
}

async function cacheInvalidate(store){
  const entry=await cacheReadEntry(store);
  const db=await openCache();
  const tx=db.transaction(CACHE_STORE,'readwrite');
  tx.objectStore(CACHE_STORE).put({data:entry?.data??[],ts:0,complete:false},store);
  return new Promise(res=>{tx.oncomplete=()=>res(true);tx.onerror=()=>res(false);});
}

async function cacheUpdateStore(store,update){
  const entry=await cacheReadEntry(store);
  const rows=Array.isArray(entry?.data)?entry.data:[];
  const next=update(rows);
  await cacheWrite(store,next,entry ? entry.complete!==false : false);
}

function isNetworkError(error){
  const message=String(error?.message||error||'').toLowerCase();
  return !navigator.onLine || error instanceof TypeError || /fetch|network|timeout|timed out|connection|offline|abort/.test(message);
}

function queueRecordId(item){
  if(item.recordId!==undefined && item.recordId!==null) return String(item.recordId);
  if(item.action==='delete'){
    const id=String(item.id||'');
    return id.startsWith('SYNC-') ? null : id;
  }
  return item.data?.id===undefined ? null : String(item.data.id);
}

function readSyncQueue(){
  try{
    const queue=JSON.parse(localStorage.getItem('autopuerta_sync_queue')||'[]');
    return Array.isArray(queue) ? queue : [];
  }catch(e){ return []; }
}

function writeSyncQueue(queue){
  localStorage.setItem('autopuerta_sync_queue',JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent('autopuerta:sync-state',{detail:{pending:queue.length,online:navigator.onLine}}));
}

async function enqueueSyncOperation(item){
  const recordId=item.action==='delete' ? String(item.id) : queueRecordId(item);
  const entry={...item,recordId,ts:Date.now(),queueId:'SYNC-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)};
  const queue=readSyncQueue().filter(pending=>{
    return !(pending.store===entry.store && recordId!==null && queueRecordId(pending)===recordId);
  });
  queue.push(entry);
  writeSyncQueue(queue);
  if(navigator.onLine) setTimeout(()=>flushSyncQueue(),0);
  return entry;
}

async function cacheApplyPending(store,rows){
  const queue=await dbSyncQueueGetPending();
  return queue.filter(item=>item.store===store).reduce((result,item)=>{
    const id=queueRecordId(item);
    if(id===null) return result;
    const index=result.findIndex(record=>String(record.id)===id);
    if(item.action==='delete'){
      if(index!==-1) result.splice(index,1);
    }else if(item.data){
      const record={...item.data,id:item.data.id||id};
      if(index===-1) result.push(record);
      else result[index]=record;
    }
    return result;
  },Array.isArray(rows)?rows.slice():[]);
}

// ── Helpers CRUD ──────────────────────────────────────────
async function openDB(){ return supabaseDB; }

function rejectAuthenticatedOfflineWrite(){
  if(window.authState?.user && !navigator.onLine){
    throw new Error('Esta acción requiere conexión para proteger los permisos de la cuenta.');
  }
}

window.dbGetTechnicianEmployee=async function(){
  const {data,error}=await supabaseDB.rpc('get_my_employee');
  if(error) throw error;
  return data;
};

window.clearAuthenticatedCache=async function(){
  for(const store of Object.keys(TABLA)) await cacheWrite(store,[],false);
  await dbSyncQueueClear();
};

async function dbAdd(store,data){
  rejectAuthenticatedOfflineWrite();
  if(store==='partesTrabajo' && !navigator.onLine){
    throw new Error('Para crear un parte hace falta conexión; Supabase debe asignarle su ID.');
  }
  const tableName=TABLA[store]||store;
  const input={...data};
  if(['partesTrabajo','revisiones','solicitudesMaterial'].includes(store) && window.authState?.user && !Object.prototype.hasOwnProperty.call(input,'createdBy')){
    input.createdBy=window.authState.user.id;
  }
  const obj=toDB(input);
  if(!obj.id && store !== 'partesTrabajo'){
    const pref=(store==='partesTrabajo'?'PARTE':store.slice(0,3).toUpperCase());
    obj.id=nextId(pref);
  }
  const local=fromJS(obj);
  if(!navigator.onLine){
    await cacheUpdateStore(store,rows=>{rows.push(local);return rows;});
    await enqueueSyncOperation({action:'put',store,data:local});
    return local;
  }
  try{
    const insertQuery=supabaseDB.from(tableName).insert(obj);
    const {data:result,error}=await (store==='partesTrabajo' && window.isTechnician?.()
      ? insertQuery.select('id').maybeSingle()
      : insertQuery.select().maybeSingle());
    if(error) {
      if(String(error.code || '').toUpperCase() === 'PGRST116') return local;
      throw error;
    }
    const saved = result ? fromJS({...obj,...result}) : local;
    await cacheUpdateStore(store,rows=>{rows.push(saved);return rows;});
    return saved;
  }catch(error){
    if(!isNetworkError(error) && String(error?.code || '').toUpperCase() !== 'PGRST116') throw error;
    if(window.authState?.user) throw error;
    await cacheUpdateStore(store,rows=>{rows.push(local);return rows;});
    await enqueueSyncOperation({action:'put',store,data:local});
    return local;
  }
}

async function dbCreate(store,data){ return dbAdd(store,data); }

async function dbPut(store,data){
  rejectAuthenticatedOfflineWrite();
  const tableName=TABLA[store]||store;
  const input={...data};
  if(['partesTrabajo','revisiones','solicitudesMaterial'].includes(store) && window.authState?.user && !Object.prototype.hasOwnProperty.call(input,'createdBy')){
    input.createdBy=window.authState.user.id;
  }
  const obj=toDB(input);
  if(!obj.id && store === 'partesTrabajo'){
    throw new Error('No se puede actualizar un parte sin su ID.');
  }
  if(!obj.id){
    const pref=(store==='partesTrabajo'?'PARTE':store.slice(0,3).toUpperCase());
    obj.id=nextId(pref);
  }
  const local=fromJS(obj);
  const update=rows=>{
    const index=rows.findIndex(record=>String(record.id)===String(obj.id));
    if(index===-1) rows.push(local);
    else rows[index]=local;
    return rows;
  };
  if(!navigator.onLine){
    await cacheUpdateStore(store,update);
    await enqueueSyncOperation({action:'put',store,data:local});
    return local;
  }
  try{
    const upsertQuery=supabaseDB.from(tableName).upsert(obj);
    const {data:result,error}=await (store==='partesTrabajo' && window.isTechnician?.()
      ? upsertQuery.select('id').maybeSingle()
      : upsertQuery.select().maybeSingle());
    if(error) {
      if(String(error.code || '').toUpperCase() === 'PGRST116') return local;
      throw error;
    }
    const saved = result ? fromJS({...obj,...result,id:obj.id}) : local;
    await cacheUpdateStore(store,rows=>{
      const index=rows.findIndex(record=>String(record.id)===String(obj.id));
      if(index===-1) rows.push(saved);
      else rows[index]=saved;
      return rows;
    });
    return saved;
  }catch(error){
    if(!isNetworkError(error) && String(error?.code || '').toUpperCase() !== 'PGRST116') throw error;
    if(window.authState?.user) throw error;
    await cacheUpdateStore(store,update);
    await enqueueSyncOperation({action:'put',store,data:local});
    return local;
  }
}

async function dbGet(store,id){
  const entry=await cacheReadEntry(store);
  const cached=entry?.data;
  const found=Array.isArray(cached) ? cached.find(r=>String(r.id)===String(id)) : null;
  const pending=(await dbSyncQueueGetPending()).filter(item=>item.store===store && queueRecordId(item)===String(id)).pop();
  if(pending) return pending.action==='delete' ? null : pending.data;
  if(!navigator.onLine) return found||null;
  if(store==='partesTrabajo' && window.authState?.user){
    const {data,error}=await supabaseDB.rpc('get_app_work_parts',{p_id:String(id)});
    if(error) throw error;
    return Array.isArray(data) && data.length ? fromJS(data[0]) : null;
  }
  if(store==='almacen' && window.authState?.user){
    const {data,error}=await supabaseDB.rpc('get_app_warehouse');
    if(error) throw error;
    const rows=fromJSArray(data||[]);
    const item=rows.find(row=>String(row.id)===String(id))||null;
    return item;
  }
  const tableName=TABLA[store]||store;
  try{
    const {data,error}=await supabaseDB.from(tableName).select().eq('id',id).maybeSingle();
    if(error) {
      if(String(error.code || '').toUpperCase() === 'PGRST116') return found || null;
      throw error;
    }
    return data ? fromJS(data) : (found || null);
  }catch(error){
    if(isNetworkError(error)) return found||null;
    if(String(error?.code || '').toUpperCase() === 'PGRST116') return found||null;
    throw error;
  }
}

async function dbGetAll(store){
  const tableName=TABLA[store]||store;
  const entry=await cacheReadEntry(store);
  const cached=entry?.data;
  const cacheFresh=Array.isArray(cached) && entry.complete!==false && Date.now()-entry.ts<TTL;
  if(!navigator.onLine) return cacheApplyPending(store,Array.isArray(cached)?cached:[]);
  if(store==='partesTrabajo' && window.authState?.user){
    const {data,error}=await supabaseDB.rpc('get_app_work_parts');
    if(error) throw error;
    const result=await cacheApplyPending(store,fromJSArray(data||[]));
    await cacheWrite(store,result);
    return result;
  }
  if(store==='almacen' && window.authState?.user){
    const {data,error}=await supabaseDB.rpc('get_app_warehouse');
    if(error) throw error;
    const result=await cacheApplyPending(store,fromJSArray(data||[]));
    await cacheWrite(store,result);
    return result;
  }
  if(cacheFresh){
    const result=await cacheApplyPending(store,cached);
    if(navigator.onLine) refreshStoreCache(store,tableName).catch(()=>{});
    return result;
  }
  try{
    return await refreshStoreCache(store,tableName);
  }catch(error){
    if(isNetworkError(error)) return cacheApplyPending(store,Array.isArray(cached)?cached:[]);
    throw error;
  }
}

async function refreshStoreCache(store,tableName){
  const {data,error}=await supabaseDB.from(tableName).select();
  if(error) throw error;
  const result=await cacheApplyPending(store,fromJSArray(data||[]));
  await cacheWrite(store,result);
  if(window.__onDataSynced) window.__onDataSynced(store,result);
  return result;
}

async function dbDelete(store,id){
  rejectAuthenticatedOfflineWrite();
  const tableName=TABLA[store]||store;
  const update=rows=>rows.filter(record=>String(record.id)!==String(id));
  if(!navigator.onLine){
    await cacheUpdateStore(store,update);
    await enqueueSyncOperation({action:'delete',store,id});
    return;
  }

  try{
    const {error}=await supabaseDB.from(tableName).delete().eq('id',id);
    if(error) throw error;
    await cacheUpdateStore(store,update);
  }catch(error){
    if(!isNetworkError(error)) throw error;
    if(window.authState?.user) throw error;
    await cacheUpdateStore(store,update);
    await enqueueSyncOperation({action:'delete',store,id});
  }
}

// ── Índices genéricos ──────────────────────────────────────
async function dbGetByIndex(store,indexName,value){
  const rows=await dbGetAll(store);
  const column=REN_IN[REN_OUT[indexName]||indexName]||indexName;
  return rows.filter(row=>String(row[column]??row[indexName])===String(value));
}

async function dbGetByIndexRange(store,indexName,range){
  const rows=await dbGetAll(store);
  if(range && ('lower' in range || 'upper' in range)){
    return rows.filter(row=>{
      const key=indexName.includes('matricula_fecha')
        ? [row.matricula||'',String(row.fecha||'').slice(0,10)]
        : row[REN_IN[REN_OUT[indexName]||indexName]||indexName];
      try{
        if(range.lower!==undefined){
          const cmp=indexedDB.cmp(key,range.lower);
          if(cmp<0 || (cmp===0&&range.lowerOpen)) return false;
        }
        if(range.upper!==undefined){
          const cmp=indexedDB.cmp(key,range.upper);
          if(cmp>0 || (cmp===0&&range.upperOpen)) return false;
        }
        return true;
      }catch(e){ return false; }
    });
  }
  return rows.filter(row=>{
    if(!range.gt&&!range.lt) return true;
    const columnValue=pair=>{
      const [column]=pair;
      return row[REN_IN[REN_OUT[column]||column]||column];
    };
    if(range.gt){
      const [column,value]=range.gt;
      if(columnValue(range.gt)<=value) return false;
    }
    if(range.lt){
      const [column,value]=range.lt;
      if(columnValue(range.lt)>=value) return false;
    }
    return true;
  });
}

// ── Cola offline (localStorage) ────────────────────────────
async function dbSyncQueuePush(item){
  return enqueueSyncOperation(item);
}

async function dbSyncQueueGetPending(){ return readSyncQueue(); }

async function dbSyncQueueComplete(id){
  const queue=readSyncQueue();
  writeSyncQueue(queue.filter(item=>(item.queueId||item.id)!==id));
}

async function dbSyncQueueClear(){
  writeSyncQueue([]);
}

let syncFlushPromise=null;
let syncRetryTimer=null;
let syncRetryDelay=5000;

function scheduleSyncRetry(){
  if(!navigator.onLine || syncRetryTimer) return;
  syncRetryTimer=setTimeout(()=>{
    syncRetryTimer=null;
    flushSyncQueue();
  },syncRetryDelay);
  syncRetryDelay=Math.min(syncRetryDelay*2,300000);
}

async function flushSyncQueue(){
  if(!navigator.onLine || !window.authState?.user) return;
  if(syncFlushPromise) return syncFlushPromise;
  syncFlushPromise=(async()=>{
    const queue=readSyncQueue();
    for(const item of queue){
      try{
        const tableName=TABLA[item.store]||item.store;
        let response;
        if(item.action==='delete'){
          const recordId=item.recordId??(String(item.id||'').startsWith('SYNC-')?null:item.id);
          if(recordId===null || recordId===undefined) throw new Error('Operación de borrado sin id de registro');
          response=await supabaseDB.from(tableName).delete().eq('id',recordId);
        }else{
          response=await supabaseDB.from(tableName).upsert(toDB(item.data));
        }
        if(response.error) throw response.error;
        await dbSyncQueueComplete(item.queueId||item.id);
      }catch(error){
        console.warn('[SyncQueue] operación conservada para reintento:',error.message);
        scheduleSyncRetry();
        break;
      }
    }
    const pending=readSyncQueue();
    if(!pending.length) syncRetryDelay=5000;
    window.dispatchEvent(new CustomEvent('autopuerta:sync-state',{detail:{pending:pending.length,online:navigator.onLine}}));
    return pending.length;
  })().finally(()=>{
    syncFlushPromise=null;
    if(navigator.onLine && readSyncQueue().length) scheduleSyncRetry();
  });
  return syncFlushPromise;
}

window.addEventListener('online',()=>flushSyncQueue());
window.addEventListener('offline',()=>window.dispatchEvent(new CustomEvent('autopuerta:sync-state',{detail:{pending:readSyncQueue().length,online:false}})));
setTimeout(()=>flushSyncQueue(),0);

// ── Seed protegido por flag ────────────────────────────────
async function seedIfEmpty(){
  if(localStorage.getItem('autopuerta_seed_hecho')==='1') return;
  const c=await dbGetAll('clientes');
  if(c.length>0){
    localStorage.setItem('autopuerta_seed_hecho','1');
    return;
  }

  const clientes=[
    {id:'CLI001',nombre:'Industrial del Norte S.L.',contacto:'Carlos Méndez',email:'carlos@industrialnorte.es',telefono:'948 123 456',direccion:'Pol. Industrial Norte, Nave 14, Vitoria',tipo:'empresa',nota:''},
    {id:'CLI002',nombre:'María García López',contacto:'María García',email:'maria.garcia@gmail.com',telefono:'677 234 567',direccion:'Calle Mayor 23, 1ºB, Burgos',tipo:'particular',nota:'Cliente desde 2022'},
    {id:'CLI003',nombre:'Logística Express S.A.',contacto:'Pedro Ruiz',email:'pedro@logexpress.com',telefono:'947 345 678',direccion:'Ctra. Nacional 1, Km 312, Logroño',tipo:'empresa',nota:''},
    {id:'CLI004',nombre:'Supermercados Central',contacto:'Ana Fernández',email:'ana@supcentral.es',telefono:'941 456 789',direccion:'Av. del Comercio 56, Pamplona',tipo:'empresa',nota:'3 locales'}
  ];
  for(const d of clientes) await dbPut('clientes',d);

  const tipos=[
    {id:'TP001',nombre:'Puerta Seccional',descripcion:'Puerta seccional estándar, manual o motorizada',checklist:['Estado general','Cierre','Sellado','Guías','Muelles']},
    {id:'TP002',nombre:'Puerta Rápida de Lona',descripcion:'Puerta rápida de alta velocidad, lona PVC',checklist:['Lona','Rodamientos','Mando','Células','Motor']},
    {id:'TP003',nombre:'Puerta Corredera',descripcion:'Puerta corredera industrial o residencial',checklist:['Estado general','Rodamientos','Guías','Cierre','Cerradura']},
    {id:'TP004',nombre:'Puerta Basculante',descripcion:'Puerta basculante de garaje',checklist:['Estado general','Muelles','Rodamientos','Guías','Motor']},
    {id:'TP005',nombre:'Motor / Automatización',descripcion:'Kit de motorización para puertas existentes',checklist:['Motor','Electrónica','Mandos','Limitadores','Cadenas']},
    {id:'TP006',nombre:'Mantenimiento',descripcion:'Servicio de mantenimiento preventivo o correctivo',checklist:['Limpieza','Lubricación','Ajuste','Pruebas','Documentación']},
    {id:'TP007',nombre:'Reparación',descripcion:'Reparación de averías y componentes',checklist:['Diagnóstico','Componente','Prueba','Limpieza','Documentación']}
  ];
  for(const t of tipos) await dbPut('tiposPuerta',t);

  const vehiculos=[
    {id:'VEH001',matricula:'1234 BKL',marca:'Fiat',modelo:'Ducato',anno:2022,estado:'disponible',km:45200,nota:'Vehículo principal'},
    {id:'VEH002',matricula:'5678 MNP',marca:'Renault',modelo:'Master',anno:2021,estado:'en_ruta',km:68300,nota:''},
    {id:'VEH003',matricula:'9012 QRS',marca:'Volkswagen',modelo:'Caddy',anno:2023,estado:'disponible',km:22100,nota:'Vehículo pequeño para ciudad'}
  ];
  for(const v of vehiculos) await dbPut('vehiculos',v);

  const almacen=[
    {id:'ART001',referencia:'PSE-2500-STD',nombre:'Puerta seccional 2500x2500mm estándar',unidad:'unidad',precioCompra:680,precioVenta:1250,stock:4,stockMinimo:2,proveedor:'PuertasGarcía S.L.',categoria:'producto'},
    {id:'ART002',referencia:'PPR-2000-VEL',nombre:'Puerta rápida lona 2000x2500mm velocidad',unidad:'unidad',precioCompra:1100,precioVenta:2100,stock:1,stockMinimo:1,proveedor:'FastDoor España',categoria:'producto'},
    {id:'ART003',referencia:'MOT-400-N',nombre:'Motor 400N para puerta seccional',unidad:'unidad',precioCompra:220,precioVenta:380,stock:8,stockMinimo:3,proveedor:'Automatech',categoria:'recambio'},
    {id:'ART004',referencia:'MUE-TOR-2000',nombre:'Muelle de torsión 2000 lbs',unidad:'unidad',precioCompra:95,precioVenta:165,stock:6,stockMinimo:2,proveedor:'PuertasGarcía S.L.',categoria:'recambio'},
    {id:'ART005',referencia:'CEL-FOT-IR',nombre:'Célula fotoeléctrica infrarroja',unidad:'unidad',precioCompra:35,precioVenta:72,stock:15,stockMinimo:5,proveedor:'SensoresPro',categoria:'recambio'},
    {id:'ART006',referencia:'COR-3000-IND',nombre:'Puerta corredera 3000x3000mm industrial',unidad:'unidad',precioCompra:850,precioVenta:1550,stock:2,stockMinimo:1,proveedor:'PuertasGarcía S.L.',categoria:'producto'}
  ];
  for(const a of almacen) await dbPut('almacen',a);

  const empleados=[
    {id:'EMP001',nombre:'Técnico Principal',telefono:'600 000 000',dni:'12345678A',email:''},
    {id:'EMP002',nombre:'Técnico Junior',telefono:'600 111 111',dni:'87654321B',email:''}
  ];
  for(const e of empleados) await dbPut('empleados',e);

  localStorage.setItem('autopuerta_seed_hecho','1');
}

// ── Exponer globales ───────────────────────────────────────
window.db={
  openDB,nextId,dbAdd,dbCreate,dbPut,dbGet,dbGetAll,dbDelete,
  dbGetByIndex,dbGetByIndexRange,
  dbSyncQueuePush,dbSyncQueueGetPending,dbSyncQueueComplete,dbSyncQueueClear,
  seedIfEmpty,cacheInvalidate
};
window.seedIfEmpty=seedIfEmpty;