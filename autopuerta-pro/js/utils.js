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
  function injectVoiceButtons(root=document){
    const inputs = [];
    if(root.matches?.('input[type="text"], textarea')) inputs.push(root);
    root.querySelectorAll?.('input[type="text"], textarea').forEach(el => inputs.push(el));
    inputs.forEach(el => {
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

  const voiceObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
      if(node.nodeType === Node.ELEMENT_NODE) injectVoiceButtons(node);
    }));
  });
  voiceObserver.observe(document.body, {childList:true, subtree:true});
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
// Las firmas se guardan siempre en un lienzo lógico fijo (proporción 5:2), sea cual
// sea el tamaño en pantalla, para que se vean igual en el móvil, el PDF y el escritorio.
const FIRMA_W = 600, FIRMA_H = 240;

function firmaDibujarTrazos(ctx, strokes, mapPoint, lineWidth, color){
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  strokes.forEach(points => {
    if(!points.length) return;
    const pts = points.map(mapPoint);
    if(pts.length === 1){
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for(let i = 1; i < pts.length - 1; i++){
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  });
}

// Recorta los trazos, los escala sin deformar y los centra en el lienzo de destino.
function firmaVolcarEnLienzo(canvas, strokes, sourceWidth){
  const all = strokes.flat();
  if(!all.length) return;
  const xs = all.map(p => p.x), ys = all.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const boxW = Math.max(maxX - minX, 1), boxH = Math.max(maxY - minY, 1);
  const pad = 14;
  const scale = Math.min((FIRMA_W - pad * 2) / boxW, (FIRMA_H - pad * 2) / boxH, 2.5);
  const offX = (FIRMA_W - boxW * scale) / 2 - minX * scale;
  const offY = (FIRMA_H - boxH * scale) / 2 - minY * scale;
  canvas.width = FIRMA_W;
  canvas.height = FIRMA_H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, FIRMA_W, FIRMA_H);
  const lineWidth = Math.min(Math.max(sourceWidth * scale, 2.5), 6);
  firmaDibujarTrazos(ctx, strokes, p => ({ x: p.x * scale + offX, y: p.y * scale + offY }), lineWidth, '#111');
}

// Pantalla completa para firmar con el dedo. Devuelve una promesa con los trazos, o null si se cancela.
function abrirPadFirma(titulo){
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:3000;background:#0f172a;display:flex;flex-direction:column;padding:12px;gap:10px;touch-action:none;';
    overlay.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;color:#fff;gap:12px">' +
        '<strong style="font-size:16px">' + escapeHtml(titulo || 'Firma') + '</strong>' +
        '<small style="opacity:.75;text-align:right">Firma con el dedo dentro del recuadro</small>' +
      '</div>' +
      '<div id="padWrap" style="flex:1;min-height:0;position:relative;background:#fff;border-radius:12px;overflow:hidden">' +
        '<canvas id="padCanvas" style="position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block"></canvas>' +
        '<div style="position:absolute;left:5%;right:5%;bottom:22%;border-bottom:2px dashed #cbd5e1;pointer-events:none"></div>' +
        '<div style="position:absolute;left:5%;bottom:calc(22% + 6px);color:#94a3b8;font-size:20px;pointer-events:none">✕</div>' +
      '</div>' +
      '<div style="display:flex;gap:10px">' +
        '<button type="button" class="btn btn-outline" id="padClear" style="flex:1;min-height:48px">Borrar</button>' +
        '<button type="button" class="btn btn-outline" id="padCancel" style="flex:1;min-height:48px">Cancelar</button>' +
        '<button type="button" class="btn btn-primary" id="padOk" style="flex:2;min-height:48px" disabled>Aceptar</button>' +
      '</div>';
    document.body.appendChild(overlay);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const canvas = overlay.querySelector('#padCanvas');
    const okBtn = overlay.querySelector('#padOk');
    const ctx = canvas.getContext('2d');
    let strokes = [];
    let current = null;
    let cssW = 1, cssH = 1;

    const LINE = 3.2;
    function repaint(){
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      firmaDibujarTrazos(ctx, strokes, p => ({ x: p.x * cssW, y: p.y * cssH }), LINE, '#111');
    }
    function resize(){
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      cssW = Math.max(rect.width, 1);
      cssH = Math.max(rect.height, 1);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      repaint();
    }
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);

    function pos(e){
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    }
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      current = [pos(e)];
      strokes.push(current);
      repaint();
    });
    canvas.addEventListener('pointermove', e => {
      if(!current) return;
      e.preventDefault();
      (e.getCoalescedEvents ? e.getCoalescedEvents() : [e]).forEach(ev => current.push(pos(ev)));
      repaint();
    });
    const end = e => {
      if(!current) return;
      current = null;
      okBtn.disabled = !strokes.length;
      if(e) e.preventDefault();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    function close(result){
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      document.body.style.overflow = prevOverflow;
      overlay.remove();
      resolve(result);
    }
    overlay.querySelector('#padClear').addEventListener('click', () => {
      strokes = []; current = null; okBtn.disabled = true; repaint();
    });
    overlay.querySelector('#padCancel').addEventListener('click', () => close(null));
    okBtn.addEventListener('click', () => {
      // Pasa de coordenadas normalizadas a píxeles de pantalla para conservar la proporción real.
      const px = strokes.map(s => s.map(p => ({ x: p.x * cssW, y: p.y * cssH })));
      close({ strokes: px, width: LINE });
    });
  });
}

function initFirmaCanvas(canvasId, opts = {}){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return null;

  const ctx = canvas.getContext('2d');
  const color = opts.color || '#111';
  const lineWidth = opts.width || 3;
  const titulo = opts.title || canvas.getAttribute('data-firma-titulo') || 'Firma';

  canvas.width = FIRMA_W;
  canvas.height = FIRMA_H;
  canvas.style.height = 'auto';
  canvas.style.aspectRatio = FIRMA_W + ' / ' + FIRMA_H;
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'pointer';

  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  let drawing = false;
  let last = null;

  function getPos(e){
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height)
    };
  }

  // En pantallas táctiles se firma en una pantalla completa; con ratón se dibuja directamente.
  async function openPad(){
    const result = await abrirPadFirma(titulo);
    if(result && result.strokes.length) firmaVolcarEnLienzo(canvas, result.strokes, result.width);
  }

  if(coarse){
    canvas.addEventListener('click', openPad);
  }else{
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drawing = true;
      last = getPos(e);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(last.x, last.y, lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    });
    canvas.addEventListener('pointermove', e => {
      if(!drawing) return;
      e.preventDefault();
      const p = getPos(e);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    });
    const stop = () => { drawing = false; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
  }

  return {
    clear: ()=>{ ctx.clearRect(0,0,canvas.width,canvas.height); },
    getDataURL: ()=> canvas.toDataURL('image/png'),
    hasSignature: ()=> hasSignature(canvasId)
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
  if (!canvas || !canvas.width || !canvas.height) return false;

  try {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    // Hay firma si algún píxel es visible y no es blanco puro opaco (fondo vacío).
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha > 0 && !(alpha === 255 && data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255)) {
        return true;
      }
    }
  } catch (e) {
    console.error('Error al verificar firma:', e);
  }
  return false;
}

function pintarFirmaEnCanvas(canvasId, dataURL){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  canvas.width = FIRMA_W;
  canvas.height = FIRMA_H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!dataURL) return;

  const img = new Image();
  img.onload = function(){
    const ratio = Math.min(FIRMA_W / img.width, FIRMA_H / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img, (FIRMA_W - w) / 2, (FIRMA_H - h) / 2, w, h);
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
if (typeof window.closeModal !== 'function') {
  window.closeModal = function(){
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.style.display = '';
  };
}
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

// Calcular próxima revisión para PUERTAS según tipo
function calcularProximaRevisionPuerta(tipo, ultimaRevision) {
  const dias = getDiasRevisionByTipo(tipo);
  if (!ultimaRevision) {
    const d = new Date();
    return `${d.getFullYear() + 1}-01-01`;
  }
  const base = new Date(ultimaRevision);
  base.setDate(base.getDate() + dias);
  return base.toISOString().slice(0, 10);
}

// Compatibilidad: cálculo de fechas para RUTAS (por meses)
function calcularProximaRevisionRuta(ultimaRevisionISO, meses = 6) {
  if (!ultimaRevisionISO) return null;
  const fecha = new Date(ultimaRevisionISO);
  fecha.setMonth(fecha.getMonth() + meses);
  return fecha.toISOString();
}

window.calcularProximaRevisionPuerta = calcularProximaRevisionPuerta;
window.calcularProximaRevisionRuta = calcularProximaRevisionRuta;
window.calcularProximaRevision = calcularProximaRevisionRuta;
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

  if (!nombre) { mostrarToast('El nombre de la ruta es obligatorio', 'error'); return false; }
  if (!cadenaid) { mostrarToast('Selecciona la cadena a la que pertenece', 'error'); return false; }

  const ahora = new Date().toISOString();
  const ruta = {
    id: idExistente || window.db.nextId('RUT'),
    nombre,
    cadenaid,
    cadenaId: cadenaid,
    frecuenciameses,
    frecuenciaMeses: frecuenciameses,
    orden,
    ultimorevision,
    ultimaRevision: ultimorevision,
    proximarevision: calcularProximaRevisionRuta(ultimorevision, frecuenciameses),
    proximaRevision: calcularProximaRevisionRuta(ultimorevision, frecuenciameses),
    updatedat: ahora
  };

  try {
    if(!idExistente){
      if(!orden) ruta.orden=(await getRutasByCadena(cadenaid)).length;
      ruta.createdat=ahora;
    }
    if (cadenaid) {
      window.setCurrentCadenId(cadenaid);
      localStorage.setItem('cadenaId', String(cadenaid));
    }
    await dbPut('rutas',ruta);
  } catch (e) {
    console.error('saveRuta falló:', e);
    mostrarToast('Error guardando la ruta', 'error');
    return false;
  }

  closeModal?.();
  mostrarToast(idExistente ? 'Ruta actualizada' : 'Ruta creada', 'success');

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

  try {
    const todasRutas = await dbGetAll('rutas');
    for (const r of todasRutas) {
      const ruta = {
        ...r,
        cadenaId: r.cadenaId ?? r.cadenaid ?? null,
        proximaRevision: r.proximaRevision ?? r.proximarevision ?? null,
        ultimaRevision: r.ultimaRevision ?? r.ultimorevision ?? null,
      };
      if (!ruta.proximaRevision) continue;
      const proxima = new Date(ruta.proximaRevision);
      if (proxima <= treintaDias) {
        pendientes.push({
          id: ruta.id,
          tipo: 'ruta',
          nombre: ruta.nombre,
          detalle: `Ruta ${ruta.nombre} (Cadena ${ruta.cadenaId})`,
          proxima: ruta.proximaRevision,
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
  const rutas = await dbGetAll('rutas');
  return rutas
    .map(r => ({
      ...r,
      cadenaId: r.cadenaId ?? r.cadenaid ?? null,
      cadenaid: r.cadenaid ?? r.cadenaId ?? null,
      proximaRevision: r.proximaRevision ?? r.proximarevision ?? null,
      proximarevision: r.proximarevision ?? r.proximaRevision ?? null,
      ultimaRevision: r.ultimaRevision ?? r.ultimorevision ?? null,
      ultimorevision: r.ultimorevision ?? r.ultimaRevision ?? null
    }))
    .filter(r => String(r.cadenaId ?? r.cadenaid) === String(cadenaId));
}