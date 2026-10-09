/**
 * db.js v11 — Supabase + caché IndexedDB (offline-first)
 * AutoPuerta Pro
 *
 * Cambios vs v10.2:
 *  - KEY leída de window.SUPABASE_CONFIG (definido en index.html)
 *  - TABLA.partesTrabajo → 'partesTrabajo' (estaba 'partes_trabajo')
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

const supabaseDB = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
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
  partesTrabajo: 'partesTrabajo',
  cadenas:       'cadenas',
  rutas:         'rutas',
  articulos:     'articulos',
  jornadas:     'jornadas'
};

// ── Renombrado camelCase ↔ snake_case ──────────────────────
const REN_OUT = {
  updatedAt:'updatedat',
  precioCompra:'preciocompra',
  precioVenta:'precioventa',
  stockMinimo:'stockminimo',
  puertaIds:'puertaids',
  clienteId:'clienteid',
  clienteNombre:'clientenombre',
  tipoPuerta:'tipopuerta',
  kmInicial:'km_inicial',
  puertaId:'puertaid',
  ubicacionId:'ubicacionid',
  matriculaAsociada:'matriculaasociada',
  medidasAncho:'medidasancho',
  medidasAlto:'medidasalto',
  anioInstalacion:'anioinstalacion',
  fechaRevision:'fecharevision',
  frecuenciaMeses:'frecuenciameses',
  proximaRevision:'proximaprevision',
  resultadoRev:'resultado',
  observacionesRev:'observaciones',
  // Clientes
  esCadena:'escadena',
  padreId:'padreid',
  cadenaId:'cadenaid',
  rutaId:'rutaid'
};
const REN_IN = {
  updatedat:'updatedAt',
  precocompra:'precioCompra',
  precioventa:'precioVenta',
  stockminimo:'stockMinimo',
  puertaids:'puertaIds',
  clienteid:'clienteId',
  clientenombre:'clienteNombre',
  tipopuerta:'tipoPuerta',
  km_inicial:'kmInicial',
  puertaid:'puertaId',
  ubicacionid:'ubicacionId',
  matriculaasociada:'matriculaAsociada',
  medidasancho:'medidasAncho',
  medidasalto:'medidasAlto',
  anioinstalacion:'anioInstalacion',
  fecharevision:'fechaRevision',
  frecuenciameses:'frecuenciaMeses',
  proximaprevision:'proximaRevision',
  resultado:'resultadoRev',
  observaciones:'observacionesRev',
  escadena:'escadena',
  padreid:'padreid',
  cadenaid:'cadenaid',
  rutaid:'rutaid'
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

async function cacheRead(store){
  try{
    const db=await openCache();
    return await new Promise(res=>{
      const rq=db.transaction(CACHE_STORE).objectStore(CACHE_STORE).get(store);
      rq.onsuccess=()=>{
        const e=rq.result;
        res(e && Date.now()-e.ts < TTL ? e.data : null);
      };
      rq.onerror=()=>res(null);
    });
  }catch(e){ return null; }
}

async function cacheWrite(store,data){
  try{
    const db=await openCache();
    const tx=db.transaction(CACHE_STORE,'readwrite');
    tx.objectStore(CACHE_STORE).put({data,ts:Date.now()},store);
    return new Promise(res=>{tx.oncomplete=()=>res(true);tx.onerror=()=>res(false);});
  }catch(e){ return false; }
}

async function cacheInvalidate(store){ await cacheWrite(store,null); }

// ── Helpers CRUD ──────────────────────────────────────────
async function openDB(){ return supabaseDB; }

async function dbAdd(store,data){
  const tableName=TABLA[store]||store;
  const obj=toDB(data);
  if(!obj.id){
    const pref=(store==='partesTrabajo'?'PARTE':store.slice(0,3).toUpperCase());
    obj.id=nextId(pref);
  }
  const {data:result,error}=await supabaseDB.from(tableName).insert(obj).select().single();
  if(error) throw error;
  cacheInvalidate(store);
  return fromJS(result);
}

async function dbCreate(store,data){ return dbAdd(store,data); }

async function dbPut(store,data){
  const tableName=TABLA[store]||store;
  const obj=toDB(data);
  if(!obj.id){
    const pref=(store==='partesTrabajo'?'PARTE':store.slice(0,3).toUpperCase());
    obj.id=nextId(pref);
  }
  const {data:result,error}=await supabaseDB.from(tableName).upsert(obj).select().single();
  if(error) throw error;
  cacheInvalidate(store);
  return fromJS({...result,id:obj.id});
}

async function dbGet(store,id){
  const cached=await cacheRead(store);
  if(cached){
    const found=cached.find(r=>String(r.id)===String(id));
    if(found) return found;
  }
  const tableName=TABLA[store]||store;
  const {data,error}=await supabaseDB.from(tableName).select().eq('id',id).single();
  if(error) throw error;
  return fromJS(data);
}

async function dbGetAll(store){
  const tableName=TABLA[store]||store;
  const cached=await cacheRead(store);

  // Siempre consultamos Supabase; la caché solo acelera el primer pintado
  supabaseDB.from(tableName).select().order('createdat',{ascending:false})
    .then(({data,error})=>{
      if(error){ // tablas sin createdat → reintento simple
        return supabaseDB.from(tableName).select();
      }
      return {data,error};
    })
    .then(async res=>{
      if(res && !res.error){
        const fresh=fromJSArray(res.data||[]);
        await cacheWrite(store,fresh);
        if(window.__onDataSynced) window.__onDataSynced(store, fresh); // repinta si hay listener
      }
    })
    .catch(()=>{});

  if(cached) return cached;          // pintamos rápido con lo que hay
  const {data,error}=await supabaseDB.from(tableName).select();
  if(error) throw error;
  const result=fromJSArray(data||[]);
  await cacheWrite(store,result);
  return result;
}

async function dbDelete(store,id){
  const tableName=TABLA[store]||store;
  const {error}=await supabaseDB.from(tableName).delete().eq('id',id);
  if(error) throw error;
  cacheInvalidate(store);
}

// ── Índices genéricos ──────────────────────────────────────
async function dbGetByIndex(store,indexName,value){
  const tableName=TABLA[store]||store;
  const col=REN_OUT[indexName]||indexName;
  const {data,error}=await supabaseDB.from(tableName).select().eq(col,value);
  if(error) throw error;
  return fromJSArray(data||[]);
}

async function dbGetByIndexRange(store,indexName,range){
  const tableName=TABLA[store]||store;
  let query=supabaseDB.from(tableName).select();
  if(range.gt){
    const[col,val]=range.gt;
    if(indexName.includes('matricula_fecha')){
      query=query.eq('matricula',val[0]).gte('fecha',val[1]);
    }else{
      query=query.gt(REN_OUT[col]||col,val);
    }
  }
  if(range.lt){
    const[col,val]=range.lt;
    if(indexName.includes('matricula_fecha')){
      query=query.eq('matricula',val[0]).lte('fecha',val[1]);
    }else{
      query=query.lt(REN_OUT[col]||col,val);
    }
  }
  const {data,error}=await query;
  if(error) throw error;
  return fromJSArray(data||[]);
}

// ── Cola offline (localStorage) ────────────────────────────
async function dbSyncQueuePush(item){
  const queue=JSON.parse(localStorage.getItem('autopuerta_sync_queue')||'[]');
  const entry={...item,ts:Date.now(),id:'SYNC-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)};
  queue.push(entry);
  localStorage.setItem('autopuerta_sync_queue',JSON.stringify(queue));

  if(navigator.onLine){
    try{
      const tableName=TABLA[item.store]||item.store;
      if(item.action==='delete'){
        await supabaseDB.from(tableName).delete().eq('id',item.id);
      }else{
        await supabaseDB.from(tableName).upsert(toDB(item.data));
      }
      localStorage.setItem('autopuerta_sync_queue',JSON.stringify(queue.filter(q=>q.id!==entry.id)));
    }catch(e){
      console.warn('[SyncQueue] queda en cola:',e.message);
    }
  }
  return entry;
}

async function dbSyncQueueGetPending(){
  return JSON.parse(localStorage.getItem('autopuerta_sync_queue')||'[]');
}

async function dbSyncQueueComplete(id){
  const q=JSON.parse(localStorage.getItem('autopuerta_sync_queue')||'[]');
  localStorage.setItem('autopuerta_sync_queue',JSON.stringify(q.filter(x=>x.id!==id)));
}

async function dbSyncQueueClear(){
  localStorage.removeItem('autopuerta_sync_queue');
}

window.addEventListener('online',async()=>{
  const queue=JSON.parse(localStorage.getItem('autopuerta_sync_queue')||'[]');
  if(!queue.length) return;
  const remaining=[];
  for(const item of queue){
    try{
      const tableName=TABLA[item.store]||item.store;
      if(item.action==='delete'){
        await supabaseDB.from(tableName).delete().eq('id',item.id);
      }else{
        await supabaseDB.from(tableName).upsert(toDB(item.data));
      }
    }catch(e){
      remaining.push(item);
    }
  }
  localStorage.setItem('autopuerta_sync_queue',JSON.stringify(remaining));
  console.log('[SyncQueue] pendientes tras reintento:',remaining.length);
});

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