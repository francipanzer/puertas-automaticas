// ═══════════════════════════════════════════════════════════
//  Helpers globales
// ═══════════════════════════════════════════════════════════
function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

function formatCurrency(n){
  if(n == null || isNaN(n)) n = 0;
  return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n);
}

function formatDate(d){
  if(!d) return '—';
  return new Date(d).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'});
}

function formatDateTime(d){
  if(!d) return '—';
  return new Date(d).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

// utils.js — escapeHtml (si no existe ya)
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(fn,ms=300){
  let t;
  return (...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)};
}

function getToday(){
  return new Date().toISOString().split('T')[0];
}

function getBadgeClass(status){
  const map = {
    activo:'badge-green', pendiente:'badge-yellow', aprobado:'badge-blue',
    rechazado:'badge-red', en_ruta:'badge-orange', disponible:'badge-green',
    en_taller:'badge-purple', completado:'badge-green', abierto:'badge-blue',
    cerrado:'badge-gray', enviado:'badge-blue', borrador:'badge-gray',
    en_mantenimiento:'badge-yellow'
  };
  return map[status] || 'badge-gray';
}

function getStatusLabel(status){
  const map = {
    activo:'Activo', pendiente:'Pendiente', aprobado:'Aprobado',
    rechazado:'Rechazado', en_ruta:'En ruta', disponible:'Disponible',
    en_taller:'En taller', completado:'Completado', abierto:'Abierto',
    cerrado:'Cerrado', enviado:'Enviado', borrador:'Borrador',
    en_mantenimiento:'En mantenimiento'
  };
  return map[status] || status;
}

function downloadJSON(data,filename){
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(blob);
}

// ═══════════════════════════════════════════════════════════
//  FILTRO DE CAMPOS NUMÉRICOS
// ═══════════════════════════════════════════════════════════
// Clase .only-num → solo dígitos (teléfono, km, stock, año, cantidad…)
// Clase .only-num-dec → dígitos + coma/punto decimal (precios)
document.addEventListener('input', function(e){
  const el = e.target;
  if(el.tagName !== 'INPUT') return;

  // ── Solo números enteros ──
  if(el.classList.contains('only-num')){
    const val = el.value.replace(/[^\d]/g,'');
    if(val !== el.value) el.value = val;
    return;
  }

  // ── Solo decimales ──
  if(el.classList.contains('only-num-dec')){
    let s = el.value.replace(',', '.').replace(/[^\d.]/g,'');
    // Solo un punto decimal
    const i = s.indexOf('.');
    if(i !== -1) s = s.slice(0, i+1) + s.slice(i+1).replace(/\./g,'');
    // Máximo 2 decimales
    const p = s.split('.');
    if(p[1] && p[1].length > 2) s = p[0] + '.' + p[1].slice(0, 2);
    if(s !== el.value) el.value = s;
    return;
  }
});

// ── Listener global delegado de eventos ──
// __Reemplaza los event listeners sueltos que había antes
//  Validar teléfono español (9 dígitos) ──
function validarTelefono(es){
  const soloNum = es.replace(/\D/g,'');
  return soloNum.length === 9;
}

// ── Formatear precio a formato español (coma decimal) ──
function formatoPrecioES(num){
  if(num == null || isNaN(num)) return '0,00';
  return parseFloat(num).toFixed(2).replace('.', ',');
}

document.addEventListener('click', function(e){
  const btn = e.target.closest('[data-action]');
  if(!btn) return;

  const id = btn.dataset.id || null;

  switch(btn.dataset.action){
    case 'edit-cliente':      showClienteForm(id); return;
    case 'save-cliente':      saveCliente(id); return;
    case 'edit-presupuesto':  showPresupuestoForm(id); return;
    case 'save-presupuesto':  savePresupuesto(id); return;
    case 'edit-parte':        showParteForm(id); return;
    case 'save-parte':        saveParte(id); return;
    case 'edit-vehiculo':     showVehiculoForm(id); return;
    case 'save-vehiculo':     saveVehiculo(id); return;
    case 'edit-articulo':     showArticuloForm(id); return;
    case 'save-articulo':     saveArticulo(id); return;
    case 'confirm-itv':       window.marcarITVPasada(id); return;
  }
  }); 
// ═══════════════════════════════════════════════════════════
//  GEOLOCALIZACIÓN — Ceuti como punto base
// ═══════════════════════════════════════════════════════════

/** Punto base: oficina/taller en C. Chapí, Ceutí */
const BASE_CEUTI = { lat: 38.0858, lng: -1.2741 };
const FACTOR_CARETERA = 1.3;

/** Geocodificar dirección → coordenadas (Nominatim, gratis) */
async function geocodificar(direccion){
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=es&q='
    + encodeURIComponent(direccion);
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    const data = await res.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon),
             nombreCompleto: data[0].display_name };
  } catch (e) {
    console.error('Error geocodificar:', e);
    return null;
  }
}

/** Haversine: distancia en línea recta entre dos puntos (km) */
function calcularKmLineal(origen, destino){
  const R = 6371;
  const dLat = (destino.lat - origen.lat) * Math.PI / 180;
  const dLng = (destino.lng - origen.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(origen.lat * Math.PI / 180) * Math.cos(destino.lat * Math.PI / 180) *
            Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Distancia por carretera: OSRM online → fallback Haversine × 1.3 */
/** Distancia por carretera: Haversine × 1.3 (siempre consistente) */
async function calcularKm(origen, destino){
  const lineal = calcularKmLineal(origen, destino);
  return Math.round(lineal * FACTOR_CARETERA);
}

/** Km ida + vuelta desde Ceuti, redondeado SIEMPRE arriba a múltiplo de 10 */
async function kmIdaVuelta(destino){
  const lineal = calcularKmLineal(BASE_CEUTI, destino);   // línea recta
  const idaVuelta = Math.round(lineal * FACTOR_CARETERA * 2);  // ida + vuelta carretera
  return Math.ceil(idaVuelta / 10) * 10;                  // 58 -> 60
}
// ── Subir foto al servidor ──
async function subirFoto(parteId, base64){
  const res = await fetch('/upload-foto', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ parte_id: parteId, base64: base64 })
  });
  const data = await res.json();
  if(data.error) throw new Error(data.error);
  return data.url;
}

// ── Abrir cámara y capturar foto ──
function abrirCamara(parteId, callback){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment'; // cámara trasera en móvil
  input.onchange = async function(){
    const file = input.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e){
      callback(e.target.result);
    };
    reader.readAsDataURL(file);
  };
  input.click();
}
// Dictado por voz — versión robusta con MutationObserver
// ═══════════════════════════════════════════════════════════
//  DICTADO POR VOZ
// ═══════════════════════════════════════════════════════════
(function(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){
    console.warn('Dictado por voz no soportado en este navegador');
    return;
  }

  let rec = null;
  let activeInput = null;

  function startVoice(input){
    stopVoice();
    activeInput = input;
    rec = new SR();
    rec.lang = 'es-ES';
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = function(e){
      let texto = '';
      for(let i = e.resultIndex; i < e.results.length; i++){
        if(e.results[i].isFinal) texto += e.results[i][0].transcript + ' ';
      }
      if(texto && activeInput){
        activeInput.value += (activeInput.value ? ' ' : '') + texto.trim();
        activeInput.dispatchEvent(new Event('input', {bubbles:true}));
      }
    };

    rec.onend = function(){ updateBtn(false); rec = null; activeInput = null; };
    rec.onerror = function(){ updateBtn(false); rec = null; activeInput = null; };

    try { rec.start(); updateBtn(true); } catch(e){ console.error(e); }
  }

  function stopVoice(){
    if(rec){ try{ rec.stop(); }catch(e){} rec = null; }
    updateBtn(false);
    activeInput = null;
  }

  function updateBtn(on){
    document.querySelectorAll('.voice-btn').forEach(b => b.classList.toggle('recording', on));
  }

  // Delegación de clics en botones de micrófono
  document.addEventListener('click', function(e){
    const btn = e.target.closest('.voice-btn');
    if(!btn) return;
    const container = btn.closest('.input-with-voice');
    const input = container?.querySelector('input, textarea');
    if(!input) return;
    if(activeInput === input && rec){ stopVoice(); }
    else { startVoice(input); }
  });

  // Inyectar botones donde falten
  function injectVoiceButtons(){
    document.querySelectorAll('input[type="text"], textarea').forEach(el => {
      if(el.classList.contains('only-num') ||
         el.classList.contains('only-num-dec') ||
         (el.id && el.id.startsWith('search')) ||
         el.type === 'number' || el.type === 'date' || el.type === 'email' ||
         el.parentElement?.classList.contains('input-with-voice')) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'input-with-voice';
      el.parentNode.insertBefore(wrapper, el);
      wrapper.appendChild(el);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'voice-btn';
      btn.title = 'Dictar por voz';
      btn.innerHTML = '<i class="fas fa-microphone"></i>';
      wrapper.appendChild(btn);
    });
  }

  // Intervalo ligero: revisa cada 800ms si hay inputs sin botón (modales recién abiertos)
  setInterval(injectVoiceButtons, 800);
  injectVoiceButtons();
})();
// ═══════════════════════════════════════════════════════════
//  VALIDAR DNI/NIE (formato + letra de control)
// ═══════════════════════════════════════════════════════════
function validarDNI(input){
  if(!input) return false;
  let v = String(input).trim().toUpperCase().replace(/[ -]/g,'');
  // 8 dígitos + letra, o NIE X/Y/Z + 7 dígitos + letra
  const re = /^([XYZ]?)(\d{7,8})([A-Z])$/;
  const m = v.match(re);
  if(!m) return false;
  
  const prefijo = m[1]; // X, Y o Z (vacío para DNI normal)
  let numStr = m[2];
  
  // Si empieza por X/Y/Z, cambiar al número equivalente
  if(prefijo === 'X') numStr = '0' + numStr.slice(0,7);
  else if(prefijo === 'Y') numStr = '1' + numStr.slice(0,7);
  else if(prefijo === 'Z') numStr = '2' + numStr.slice(0,7);
  
  const LETRAS = 'TRWAGMYFPDXBNJZSQVHLCKE';
  const letraEsperada = LETRAS[parseInt(numStr,10) % 23];
  const letraReal = m[3];
  
  return letraReal === letraEsperada;
}
// ═══════════════════════════════════════════════════════════
//  FIRMA DIGITAL (canvas mouse + touch)
// ═══════════════════════════════════════════════════════════
function initFirmaCanvas(canvasId, opts = {}){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return null;
  
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let lastX, lastY;
  
  const color = opts.color || '#000';
  const width = opts.width || 2;
  
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width || 400;
  canvas.height = rect.height || 120;
  
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  function getPos(e){
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return {
      x: t.clientX - r.left,
      y: t.clientY - r.top
    };
  }
  
  function startDraw(e){
    e.preventDefault();
    drawing = true;
    const p = getPos(e);
    lastX = p.x; lastY = p.y;
  }
  
  function draw(e){
    if(!drawing) return;
    e.preventDefault();
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastX = p.x; lastY = p.y;
  }
  
  function stopDraw(e){
    if(e) e.preventDefault();
    drawing = false;
  }
  
  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDraw);
  canvas.addEventListener('mouseleave', stopDraw);
  
  canvas.addEventListener('touchstart', startDraw, {passive:false});
  canvas.addEventListener('touchmove', draw, {passive:false});
  canvas.addEventListener('touchend', stopDraw, {passive:false});
  canvas.addEventListener('touchcancel', stopDraw, {passive:false});
  
  return {
    clear: ()=>{ ctx.clearRect(0,0,canvas.width,canvas.height); },
    getDataURL: ()=> canvas.toDataURL('image/png'),
    hasSignature: ()=>{
      const imgData = ctx.getImageData(0,0,canvas.width,canvas.height);
      return imgData.data.some((c,i) => i%4===3 && c>0);
    }
  };
}

function clearFirmaCanvas(canvasId){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
}

// js/utils.js
function hasSignature(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return false;

  // Asegurar que el canvas tiene dimensiones válidas
  if (!canvas.width || !canvas.height) return false;

  try {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    // Verificar si hay píxeles que no sean completamente transparentes
    // o que no sean blanco puro (si el fondo es blanco)
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      const red = data[i];
      const green = data[i + 1];
      const blue = data[i + 2];

      // Si el píxel no es transparente (alpha < 255) o no es blanco (255,255,255)
      if (alpha < 255 || (red !== 255 && green !== 255 && blue !== 255)) {
        return true;
      }
    }
  } catch (e) {
    console.error('Error al verificar firma:', e);
    return false;
  }
  return false;
}

function pintarFirmaEnCanvas(canvasId, dataURL){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!dataURL) return;
  
  const img = new Image();
  img.onload = function(){
    const maxWidth = canvas.parentElement.clientWidth - 20;
    const maxHeight = canvas.style.height ? parseInt(canvas.style.height) : 120;
    
    let w = img.width;
    let h = img.height;
    
    if(w > maxWidth || h > maxHeight){
      const ratio = Math.min(maxWidth/w, maxHeight/h);
      w = w * ratio;
      h = h * ratio;
    }
    
    canvas.width = Math.round(w);
    canvas.height = Math.round(h);
    
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  img.src = dataURL;
}

// ── Confirmación universal antes de eliminar ──
window.confirmDelete = function(itemName, callback){
  const overlay = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  const footer = document.getElementById('modalFooter');

  if(!overlay || !title || !body || !footer){
    console.error('confirmDelete: elementos del modal no encontrados');
    return;
  }

  title.textContent = 'Confirmar eliminación';
  body.innerHTML = '<p>¿Estás seguro de que quieres eliminar <strong>' + escapeHtml(itemName) + '</strong>?</p><p style="color:#dc2626;font-size:13px;margin-top:8px">Esta acción no se puede deshacer.</p>';
  footer.innerHTML =
    '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>' +
    '<button class="btn btn-danger" id="confirmDeleteBtn">Eliminar</button>';

  overlay.classList.add('open');

  document.getElementById('confirmDeleteBtn').onclick = function(){
    closeModal();
    callback();
  };
};
// ── Cerrar modal ──
window.closeModal = function(){
  const overlay = document.getElementById('modalOverlay');
  if(overlay) overlay.style.display = 'none';
};
// ═══════════════════════════════════════════════════════════
//  VALIDACIÓN DE FORMULARIOS EN LÍNEA
// ═══════════════════════════════════════════════════════════
// Muestra u oculta el error debajo de un campo concreto
function setFieldError(fieldId, msg){
  const field = document.getElementById(fieldId);
  if(!field) return false;
  clearFieldError(fieldId);
  if(msg){
    field.classList.add('input-error');
    const small = document.createElement('small');
    small.className = 'field-error-msg';
    small.style.cssText = 'color:#dc2626;font-size:11px;display:block;margin-top:3px';
    small.textContent = msg;
    field.parentNode.appendChild(small);
    return false;
  }
  return true;
}

function clearFieldError(fieldId){
  const field = document.getElementById(fieldId);
  if(!field) return;
  field.classList.remove('input-error');
  const err = field.parentNode.querySelector('.field-error-msg');
  if(err) err.remove();
}

// Limpia todos los errores de un contenedor (modal/formulario)
function clearAllFieldErrors(containerId){
  const c = document.getElementById(containerId);
  if(!c) return;
  c.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
  c.querySelectorAll('.field-error-msg').forEach(el => el.remove());
}

// Validaciones reutilizables
const validators = {
  required: (v, label)=> v && v.trim() ? '' : (label || 'Este campo') + ' es obligatorio',
  email: (v)=> !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Email no válido',
  telefono9: (v)=> !v || /^\d{9}$/.test(String(v).replace(/\D/g,'')) ? '' : 'El teléfono debe tener 9 dígitos',
};
document.addEventListener('input', function(e){
  if(e.target.classList.contains('input-error')){
    clearFieldError(e.target.id);
  }
});
// ============================================================
// HELPERS DE FECHAS PARA ÍNDICE COMPUESTO (matricula_fecha)
// ============================================================

/**
 * Devuelve la fecha de hoy en formato ISO 'YYYY-MM-DD'.
 * Ordenable lexicográficamente → compatible con IDBKeyRange.
 */
const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * Rango IDBKeyRange para TODOS los partes de un vehículo en un día concreto.
 * Uso: dbGetByIndex('partesTrabajo', 'matricula_fecha', rangeMatriculaFecha(matricula))
 */
function rangeMatriculaFecha(matricula, dateStr = todayStr()) {
  return IDBKeyRange.bound([matricula, dateStr], [matricula, '\uffff'], false, false);
}

/**
 * Rango IDBKeyRange para TODOS los partes del día (todas las matrículas).
 * Útil para el informe diario global.
 */
function rangeAllPartesOfDay(dateStr = todayStr()) {
  return IDBKeyRange.bound(['', dateStr], ['\uffff', '\uffff'], false, false);
}

/**
 * Convierte cualquier formato de fecha a ISO 'YYYY-MM-DD'.
 * Tolera: Date objects, timestamps, 'DD/MM/YYYY', 'YYYY-MM-DD'.
 */
function toISODate(value) {
  if (!value) return null;
  
  // Ya está en formato ISO correcto
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  
  // Formato español DD/MM/YYYY
  if (typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [dd, mm, yyyy] = value.split('/');
    return `${yyyy}-${mm}-${dd}`;
  }
  
  // Date object o timestamp
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  
  console.warn('[toISODate] Formato no reconocido:', value);
  return null;
}

/**
 * Verifica si una fecha ISO es válida y no está en el futuro.
 */
function isValidPastOrToday(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  return isoDate <= todayStr();
}

/**
 * Días transcurridos desde una fecha ISO hasta hoy.
 */
function daysSince(isoDate) {
  if (!isValidPastOrToday(isoDate)) return Infinity;
  const diffMs = Date.now() - new Date(isoDate + 'T00:00:00').getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
// ── Catálogo de tipos de puerta (fijo, no editable por ahora) ──
const TIPOS_PUERTA = {
  corredera: {
    nombre: 'Corredera',
    diasRevision: 180,
    checklist: [
      'Células fotoeléctricas',
      'Banda de seguridad',
      'Motor / reductora',
      'Guías y rodillos',
      'Estructura',
      'Muelle contrapeso'
    ]
  },
  batiente: {
    nombre: 'Batiente',
    diasRevision: 180,
    checklist: [
      'Cerradura / maneta',
      'Bisagras / eje',
      'Cierres / seguros',
      'Juntas',
      'Automatizador'
    ]
  },
  seccional: {
    nombre: 'Seccional',
    diasRevision: 365,
    checklist: [
      'Paneles / juntas',
      'Guías / rodillos',
      'Muelles de torsión',
      'Motor',
      'Células',
      'Cierre manual'
    ]
  },
  rapida: {
    nombre: 'Rápida de lona',
    diasRevision: 90,
    checklist: [
      'Lona / estructura',
      'Motor / mandos',
      'Sensores',
      'Borde de seguridad',
      'Guías laterales'
    ]
  },
  cortafuegos: {
    nombre: 'Cortafuegos',
    diasRevision: 365,
    checklist: [
      'Hojas / marco',
      'Cierre automático',
      'Manija antipánico',
      'Juntas de dilatación',
      'Documentación'
    ]
  }
};

// ── Helpers del catálogo ──
function getTipoPuerta(tipo) {
  return TIPOS_PUERTA[tipo] || null;
}

function getChecklistByTipo(tipo) {
  return TIPOS_PUERTA[tipo]?.checklist || [];
}

function getDiasRevisionByTipo(tipo) {
  return TIPOS_PUERTA[tipo]?.diasRevision || 365; // fallback conservador
}

// Calcular próxima revisión según reglas de negocio acordadas
function calcularProximaRevision(tipo, ultimaRevision) {
  const dias = getDiasRevisionByTipo(tipo);
  if (!ultimaRevision) {
    // Regla: si nunca se revisó → 1 enero del año siguiente
    const d = new Date();
    return `${d.getFullYear() + 1}-01-01`;
  }
  const base = new Date(ultimaRevision);
  base.setDate(base.getDate() + dias);
  return base.toISOString().slice(0, 10);
}
// ── Toast simple ──
function toast(msg, ms = 2500) {
  const cont = document.getElementById('toastContainer');
  if (!cont) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  el.style.cssText = 'background:#16a34a;color:#fff;padding:10px 16px;border-radius:8px;margin-top:8px;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,.15);opacity:0;transition:opacity .2s;';
  cont.appendChild(el);
  requestAnimationFrame(() => el.style.opacity = '1');
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, ms);
}

// ==================== RUTAS: Guardar / Actualizar ====================

/**
 * window.saveRuta() → Promise<boolean>
 * Lee inputs del modal, valida, upserta Supabase + IndexedDB.
 */
window.saveRuta = async function () {
  const idExistente = document.getElementById('form-ruta-id')?.value || null;
  const nombre = document.getElementById('form-ruta-nombre')?.value.trim();
  const cadenaid = document.getElementById('form-ruta-cadena')?.value || null;
  const frecuenciameses = parseInt(document.getElementById('form-ruta-frecuencia')?.value, 10) || 6;
  const orden = parseInt(document.getElementById('form-ruta-orden')?.value, 10) || 0;
  const ultimaVal = document.getElementById('form-ruta-ultima')?.value;
  const ultimorevision = ultimaVal ? new Date(ultimaVal + 'T00:00:00').toISOString() : null;

  // Validación
  if (!nombre) { mostrarToast('El nombre de la ruta es obligatorio', 'error'); return false; }
  if (!cadenaid) { mostrarToast('Selecciona la cadena a la que pertenece', 'error'); return false; }

  const ahora = new Date().toISOString();

  const ruta = {
    id: idExistente || String(Date.now()),
    nombre,
    cadenaid,
    frecuenciameses,
    orden,
    ultimorevision,
    proximarevision: calcularProximaRevision(ultimorevision, frecuenciameses),
    updatedat: ahora
  };

  try {
    if (idExistente) {
      // UPDATE: conserva createdat original
      const { error } = await sb.from('rutas').update({
        nombre: ruta.nombre,
        cadenaid: ruta.cadenaid,
        frecuenciameses: ruta.frecuenciameses,
        orden: ruta.orden,
        ultimorevision: ruta.ultimorevision,
        proximarevision: ruta.proximarevision,
        updatedat: ahora
      }).eq('id', idExistente);
      if (error) throw error;
    } else {
      // INSERT: si no se pasó orden, calculamos siguiente
      if (!orden) {
        const { count } = await sb.from('rutas')
          .select('*', { count: 'exact', head: true })
          .eq('cadenaid', cadenaid);
        ruta.orden = count || 0;
      }
      ruta.createdat = ahora;

      const { error } = await sb.from('rutas').insert(ruta);
      if (error) throw error;
    }
  } catch (e) {
    console.error('saveRuta Supabase falló:', e.message);
    mostrarToast('Sin conexión: guardado solo en este dispositivo', 'warning');
  }

  // IndexedDB SIEMPRE (fuente de verdad offline)
  try {
    await dbPut('rutas', { ...ruta });
  } catch (e) {
    console.error('saveRuta IndexedDB falló:', e);
    mostrarToast('Error guardando en el dispositivo', 'error');
    return false;
  }

  closeModal?.();
mostrarToast(idExistente ? 'Ruta actualizada' : 'Ruta creada', 'success');

// Recargar la vista de rutas con la cadena que tiene el formulario
if (typeof render_rutas === 'function') {
  const sel = document.getElementById('form-ruta-cadena');
  if (sel && sel.value) render_rutas(sel.value);
}
return true;
};
// ═══════════════════════════════════════════════════════════
//  PENDIENTES DE REVISIÓN (Rutas y Clientes)
// ═══════════════════════════════════════════════════════════

async function getPendientesRevision() {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const treintaDias = new Date(hoy);
  treintaDias.setDate(treintaDias.getDate() + 30);

  const pendientes = [];

  // 1. Rutas pendientes
  try {
    const todasRutas = await dbGetAll('rutas');
    for (const r of todasRutas) {
      if (!r.proximaRevision) continue;
      const proxima = new Date(r.proximaRevision);
      if (proxima <= treintaDias) {
        pendientes.push({
          id: r.id,
          tipo: 'ruta',
          nombre: r.nombre,
          detalle: `Ruta ${r.nombre} (Cadena ${r.cadenaId})`,
          proxima: r.proximaRevision,
          dias: Math.ceil((proxima - hoy) / (1000*60*60*24)),
          clase: proxima < hoy ? 'badge-red' : 'badge-yellow'
        });
      }
    }
  } catch(e) { console.warn('Error obteniendo rutas:', e); }

  // 2. Clientes sin cadena (tienen su propia proximaRevision)
  try {
    const todosClientes = await dbGetAll('clientes');
    for (const c of todosClientes) {
      if (c.esCadena || !c.proximaRevision) continue;
      const proxima = new Date(c.proximaRevision);
      if (proxima <= treintaDias) {
        pendientes.push({
          id: c.id,
          tipo: 'cliente',
          nombre: c.nombre,
          detalle: `Cliente: ${c.nombre}`,
          proxima: c.proximaRevision,
          dias: Math.ceil((proxima - hoy) / (1000*60*60*24)),
          clase: proxima < hoy ? 'badge-red' : 'badge-yellow'
        });
      }
    }
  } catch(e) { console.warn('Error obteniendo clientes:', e); }

  // 3. Puertas sueltas (sin ruta/cadena que las cubra)
  try {
    const todasPuertas = await dbGetAll('puertas');
    const clientesConRuta = new Set(
      (await dbGetAll('rutas')).map(r => r.clienteId).filter(Boolean)
    );
    for (const p of todasPuertas) {
      if (!p.proximaRevision) continue;
      // Evitar doble aviso: si su cliente ya tiene ruta, la ruta lo cubre
      if (clientesConRuta.has(p.clienteId)) continue;
      const proxima = new Date(p.proximaRevision);
      if (proxima > treintaDias) continue;   // no avisar con meses de antelación
      pendientes.push({
        id: p.id,
        tipo: 'puerta',
        nombre: `${p.marca || ''} ${p.modelo || ''}`.trim() + (p.matricula ? ` (${p.matricula})` : ''),
        detalle: `Puerta${p.tipo ? ' ' + p.tipo : ''}${p.clienteId ? ' · Cliente ' + p.clienteId : ''}`,
        proxima: p.proximaRevision,
        dias: Math.ceil((proxima - hoy) / (1000*60*60*24)),
        clase: proxima < hoy ? 'badge-red' : 'badge-yellow'
      });
    }
  } catch(e) { console.warn('Error obteniendo puertas:', e); }

  return pendientes.sort((a, b) => a.dias - b.dias);
}
// ── Helpers de cadenas y rutas ──
async function getAllCadenas() {
  return await dbGetAll('cadenas');
}

async function getRutasByCadena(cadenaId) {
  if (!cadenaId) return [];
  return (await window.db.dbGetAll('rutas'))
    .filter(r => r.cadenaId === cadenaId);
}