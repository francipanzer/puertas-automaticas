// ── App Shell ──────────────────────────────────────────────
let currentPage = 'dashboard';
let currentCadenId = null;   // ← cadena activa (la usan render_rutas / showRutaForm)
window.currentCadenId = null;
window.currentPage = 'dashboard';

// Suscribirse a cambios de cualquier store
window.__onStoreChanged = (store, payload) => {
  console.log('[App] Store cambiado:', store);
  const page = document.querySelector('.nav-item.active')?.dataset.page || currentPage;
  const storeToPage = {
    'empleados': 'empleados',
    'clientes': 'clientes',
    'partesTrabajo': 'partesTrabajo',
    'vehiculos': 'vehiculos',
    'presupuestos': 'presupuestos',
    'almacen': 'almacen',
    'cadenas': 'cadenas',      // ← nuevo
    'rutas': 'rutas',          // ← nuevo
    'puertas': 'puertas',      // ← nuevo
    'revisiones': 'revisiones' // ← nuevo
  };
  if (storeToPage[store] === page && typeof window['render_' + page] === 'function') {
    window['render_' + page](document.getElementById('mainContent'));
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  await window.seedIfEmpty();
  setupNavigation();
  setupMobileMenu();
  navigateTo('dashboard');
  registerServiceWorker();   // único punto de registro del SW
  updateSyncStatus();
  initTheme();
  checkVehiculoAlerts();     // ← ahora sí se ejecuta
});

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
  });
}

function applyTheme(mode) {
  document.body.classList.toggle('light', mode === 'light');
  localStorage.setItem('theme', mode);
  const icon = document.querySelector('#themeToggle i');
  const label = document.getElementById('themeLabel');
  if (mode === 'light') {
    icon.className = 'fas fa-sun';
    label.textContent = 'Modo oscuro';
  } else {
    icon.className = 'fas fa-moon';
    label.textContent = 'Modo claro';
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = mode === 'light' ? '#0f172a' : '#111827';
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  applyTheme(saved);
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const next = document.body.classList.contains('light') ? 'dark' : 'new' === '' ? 'dark' : (document.body.classList.contains('light') ? 'dark' : 'light');
      applyTheme(next);
    });
  }
}function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  applyTheme(saved);
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const next = document.body.classList.contains('light') ? 'dark' : 'light';
      applyTheme(next);
    });
  }
}

function setupMobileMenu() {
  const toggle = document.createElement('button');
  toggle.className = 'menu-toggle';
  toggle.innerHTML = '<i class="fas fa-bars"></i>';
  const backdrop = document.createElement('div');
  backdrop.className = 'sidebar-backdrop';
  toggle.onclick = () => {
    document.getElementById('sidebar').classList.toggle('open');
    backdrop.classList.toggle('show');
  };
  backdrop.onclick = () => {
    document.getElementById('sidebar').classList.remove('open');
    backdrop.classList.remove('show');
  };
  document.body.appendChild(toggle);
  document.body.appendChild(backdrop);
}

function navigateTo(page, arg) {
  currentPage = page;
  window.currentPage = page;

  document.querySelectorAll('.nav-item').forEach(i =>
    i.classList.toggle('active', i.dataset.page === page));

  // cerrar menú móvil
  document.getElementById('sidebar')?.classList.remove('open');
  const bd = document.querySelector('.sidebar-backdrop');
  if (bd) bd.classList.remove('show');

  const main = document.getElementById('mainContent');
  const renderer = window['render_' + page];

  if (renderer) {
    try {
      renderer(main, arg);
    } catch (e) {
      console.error('[navigateTo] error en render_' + page + ':', e);
      main.innerHTML = '<div class="empty-state"><i class="fas fa-triangle-exclamation"></i><h3>Error al cargar la página</h3></div>';
    }
  } else {
    main.innerHTML = '<div class="empty-state"><i class="fas fa-compass"></i><h3>Página no encontrada</h3></div>';
  }

  actualizarBadgeRevisiones();
}

// ── Badge de pendientes en el nav ──────────────────────────
async function actualizarBadgeRevisiones() {
  const navItem = document.querySelector('.nav-item[data-page="revisionesProgramadas"]');
  if (!navItem || typeof getPendientesRevision !== 'function') return;

  try {
    const p = await getPendientesRevision();
    let span = navItem.querySelector('.nav-badge');
    if (p.length > 0) {
      if (!span) {
        span = document.createElement('span');
        span.className = 'nav-badge';
        span.style.cssText = 'background:#e11d48;color:#fff;font-size:10px;padding:1px 6px;border-radius:10px;margin-left:6px;';
        navItem.appendChild(span);
      }
      span.textContent = p.length;
    } else if (span) {
      span.remove();
    }
  } catch (e) {
    console.warn('[badge] getPendientesRevision falló:', e.message);
  }
}

// ── Modal helpers ──────────────────────────────────────────
function openModal(title, bodyHTML, footerHTML) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  document.getElementById('modalFooter').innerHTML = footerHTML || '';
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay')?.classList.remove('open');
}
window.closeModal = closeModal;
window.openModal = openModal;

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
document.getElementById('modalOverlay')?.addEventListener('click', e => {
  if (e.target.id === 'modalOverlay') closeModal();
});

// ── Toasts ─────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  if (!c) { console.warn('toastContainer no encontrado en el DOM'); return; }

  const t = document.createElement('div');
  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-exclamation',
    info: 'fa-circle-info',
    warning: 'fa-triangle-exclamation'
  };

  t.className = 'toast ' + type;
  t.innerHTML = '<i class="fas ' + (icons[type] || 'fa-circle-info') + '"></i>';

  const span = document.createElement('span');
  span.textContent = msg;
  t.appendChild(span);

  c.appendChild(t);

  setTimeout(() => {
    t.style.transition = 'opacity .3s, transform .3s';
    t.style.opacity = '0';
    t.style.transform = 'translateX(40px)';
    setTimeout(() => t.remove(), 300);
  }, 3200);
}
// Alias usados por las funciones nuevas de pages.js
window.toast = showToast;
window.mostrarToast = showToast;

// ── Service Worker (PWA offline + instalable en Android) ───
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW registrado', reg.scope))
      .catch(err => console.warn('SW no registrado:', err));
  }
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  window.__deferredPrompt = e;
  if (typeof showInstallBanner === 'function') showInstallBanner();
  else console.warn('showInstallBanner no está definida');
});

function showInstallBanner() {
  if (localStorage.getItem('ap_install_dismissed')) return;
  const b = document.createElement('div');
  b.className = 'install-banner show';
  b.innerHTML =
    '<i class="fas fa-mobile-screen-button" style="font-size:22px;color:#60a5fa"></i>' +
    '<div>Instala la app en tu móvil' +
      '<div style="font-size:12px;opacity:.7">Funciona sin conexión</div></div>' +
    '<button class="btn btn-primary btn-sm" id="installBtn">Instalar</button>' +
    '<button id="dismissInstall" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px"><i class="fas fa-times"></i></button>';
  document.body.appendChild(b);

  document.getElementById('installBtn').onclick = async () => {
    if (window.__deferredPrompt) {
      window.__deferredPrompt.prompt();
      const { outcome } = await window.__deferredPrompt.userChoice;
      if (outcome === 'accepted') showToast('¡App instalada! Búscala en tu escritorio', 'success');
      window.__deferredPrompt = null;
    } else {
      showToast('En Android: menú ⋮ → "Instalar aplicación"', 'info');
    }
    b.remove();
  };
  document.getElementById('dismissInstall').onclick = () => {
    localStorage.setItem('ap_install_dismissed', '1');
    b.remove();
  };
}

// ── Indicador online / offline ─────────────────────────────
window.addEventListener('online', updateSyncStatus);
window.addEventListener('offline', updateSyncStatus);

function updateSyncStatus() {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  if (navigator.onLine) {
    el.className = 'sync-status online';
    el.querySelector('span').textContent = 'Conectado';
  } else {
    el.className = 'sync-status offline';
    el.querySelector('span').textContent = 'Sin conexión';
  }
}

// Función para verificar ITV y pedir permiso de notificación
async function checkVehiculoAlerts() {
  if (!("Notification" in window)) return;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  const vehiculos = await dbGetAll('vehiculos');
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  vehiculos.forEach(v => {
    if (v.itv) {
      const itvDate = new Date(v.itv);
      itvDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((itvDate - hoy) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 5) {
        new Notification("⚠️ ITV Próxima: " + v.matricula, {
          body: "El vehículo " + v.marca + " " + v.modelo + " vence la ITV en " + diffDays + " días.",
          icon: "./icons/icon-192.png"
        });
      }
    }
  });
}

// En móvil: abrir el menú automáticamente al cargar
window.addEventListener('load', () => {
  if (window.innerWidth <= 768) {
    const btn = document.querySelector('.menu-toggle');
    if (btn) setTimeout(() => btn.click(), 300);
  }
});

// Blindaje sidebar en móvil
(function () {
  function forceMobileMenu() {
    if (window.innerWidth > 768) return;
    const sb = document.getElementById('sidebar');
    if (!sb) return;
    sb.style.position = 'fixed';
    sb.style.bottom = '0';
    sb.style.top = 'auto';
    sb.style.left = '0';
    sb.style.right = '0';
    sb.style.transform = 'none';
    sb.style.margin = '0';
    sb.style.width = '100%';
    sb.style.display = 'flex';
    sb.style.visibility = 'visible';
    sb.style.opacity = '1';
    const btn = document.querySelector('.menu-toggle');
    if (btn) { btn.style.position = 'fixed'; btn.style.top = '-9999px'; btn.style.left = '-9999px'; }
  }
  window.addEventListener('load', forceMobileMenu);
  document.addEventListener('click', e => {
    if (e.target.closest('.nav-item')) setTimeout(forceMobileMenu, 100);
  });
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(forceMobileMenu, 200);
  });
})();

// ── Cierre de modales (excluye overlays de gestión) ────────
function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => {
    if (['overlayUbicaciones', 'overlayPuertas', 'overlayRevision', 'overlayRonda',
         'modal-revision-overlay'].includes(m.id)) return;
    m.classList.remove('active', 'open');
    m.style.display = '';
  });
  document.body.classList.remove('modal-open');
}
window.addEventListener('load', closeAllModals);
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) closeAllModals();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAllModals();
});

// ==========================================
// GESTIÓN DE UBICACIONES (Clientes)
// ==========================================
let ubicClienteActual = null;

async function gestionarUbicaciones(clienteId) {
  const cliente = await dbGet('clientes', clienteId);
  if (!cliente) return alert('Cliente no encontrado');
  ubicClienteActual = clienteId;
  abrirModalUbicaciones(cliente);
}

function abrirModalUbicaciones(cliente) {
  cerrarModalUbicaciones();

  const overlay = document.createElement('div');
  overlay.id = 'overlayUbicaciones';
  overlay.dataset.cliente = cliente.id;
  overlay.className = 'modal-overlay open';

  overlay.innerHTML =
    '<div class="modal modal-ubic">' +
      '<div class="modal-header">' +
        '<h3>Ubicaciones · ' + escapeHtml(cliente.nombre) + '</h3>' +
        '<button class="modal-close" onclick="cerrarModalUbicaciones()">×</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="ubic-form">' +
          '<input type="text" id="ub_denominacion" placeholder="Nombre (ej: Nave Alcalá)">' +
          '<input type="text" id="ub_direccion" placeholder="Dirección completa">' +
          '<input type="text" id="ub_notas" placeholder="Notas (acceso, horario...) opcional">' +
          '<button class="btn btn-primary" onclick="guardarUbicacion()">+ Añadir ubicación</button>' +
        '</div>' +
        '<div id="listaUbicaciones" style="margin-top:16px"></div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  overlay.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') guardarUbicacion(); });
  });

  pintarListaUbicaciones();
}

function cerrarModalUbicaciones() {
  document.getElementById('overlayUbicaciones')?.remove();
  ubicClienteActual = null;
}

function getUbicClienteActual() {
  return document.getElementById('overlayUbicaciones')?.dataset.cliente || ubicClienteActual;
}

async function pintarListaUbicaciones() {
  const cont = document.getElementById('listaUbicaciones');
  if (!cont) return;

  const lista = await dbGetByIndex('ubicaciones', 'clienteId', getUbicClienteActual());

  if (!lista.length) {
    cont.innerHTML = '<p class="ubic-vacio">Este cliente aún no tiene ubicaciones. Añade la primera arriba.</p>';
    return;
  }

  cont.innerHTML = lista.map(u => `
    <div class="ubic-item">
      <div>
        <strong>${escapeHtml(u.denominacion)}</strong><br>
        <small>${escapeHtml(u.direccion || '')}</small>
        ${u.notas ? '<br><small style="color:var(--text-muted)">📝 ' + escapeHtml(u.notas) + '</small>' : ''}
      </div>
      <button class="btn btn-sm btn-danger" onclick="eliminarUbicacion('${u.id}')">Eliminar</button>
    </div>
  `).join('');
}

async function guardarUbicacion() {
  const den  = document.getElementById('ub_denominacion').value.trim();
  const dir  = document.getElementById('ub_direccion').value.trim();
  const nota = document.getElementById('ub_notas').value.trim();

  if (!den) return alert('El nombre de la ubicación es obligatorio');

  await dbAdd('ubicaciones', {
    id: 'UBI-' + Date.now(),
    clienteId: getUbicClienteActual(),
    denominacion: den,
    direccion: dir,
    notas: nota
  });

  document.getElementById('ub_denominacion').value = '';
  document.getElementById('ub_direccion').value = '';
  document.getElementById('ub_notas').value = '';
  document.getElementById('ub_denominacion').focus();

  pintarListaUbicaciones();
}

async function eliminarUbicacion(id) {
  if (!confirm('¿Eliminar esta ubicación?')) return;
  await dbDelete('ubicaciones', id);
  pintarListaUbicaciones();
}

// ==========================================
// GESTIÓN DE PUERTAS (Clientes)
// ==========================================

// Helper: días hasta una fecha (negativo si ya pasó)
function diasHasta(fechaStr) {
  if (!fechaStr) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const f = new Date(fechaStr); f.setHours(0, 0, 0, 0);
  return Math.ceil((f - hoy) / (1000 * 60 * 60 * 24));
}

let puertaClienteActual = null;

async function gestionarPuertas(clienteId) {
  const cliente = await dbGet('clientes', clienteId);
  if (!cliente) return alert('Cliente no encontrado');
  puertaClienteActual = clienteId;
  abrirModalPuertas(cliente);
}

function abrirModalPuertas(cliente) {
  cerrarModalPuertas();

  const opciones = Object.entries(TIPOS_PUERTA)
    .map(([k, v]) => `<option value="${k}">${v.nombre}</option>`)
    .join('');

  const overlay = document.createElement('div');
  overlay.id = 'overlayPuertas';
  overlay.dataset.cliente = cliente.id;
  overlay.className = 'modal-overlay open';

  overlay.innerHTML =
    '<div class="modal modal-ubic">' +
      '<div class="modal-header">' +
        '<h3>Puertas · ' + escapeHtml(cliente.nombre) + '</h3>' +
        '<button class="modal-close" onclick="cerrarModalPuertas()">×</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="ubic-form">' +
          '<input type="text" id="pu_nombre" placeholder="Nombre / matrícula (ej: Nave 1 - Acceso A)">' +
          '<select id="pu_tipo">' + opciones + '</select>' +
          '<select id="pu_estado">' +
            '<option value="operativa">🟢 Operativa</option>' +
            '<option value="averiada">🔴 Averiada</option>' +
            '<option value="fuera_servicio">⚪ Fuera de servicio</option>' +
          '</select>' +
          '<select id="pu_ubicacion"><option value="">Sin ubicación</option></select>' +
          '<input type="text" id="pu_notas" placeholder="Notas (opcional)">' +
          '<button class="btn btn-primary" onclick="guardarPuerta()">+ Añadir puerta</button>' +
        '</div>' +
        '<div id="listaPuertas" style="margin-top:16px"></div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  cargarUbicacionesEnSelect(cliente.id);
  pintarListaPuertas();
}

function cerrarModalPuertas() {
  document.getElementById('overlayPuertas')?.remove();
  puertaClienteActual = null;
}

function getPuertaClienteActual() {
  return document.getElementById('overlayPuertas')?.dataset.cliente || puertaClienteActual;
}

async function cargarUbicacionesEnSelect(clienteId) {
  const sel = document.getElementById('pu_ubicacion');
  if (!sel) return;
  const ubs = await dbGetByIndex('ubicaciones', 'clienteId', clienteId);
  sel.innerHTML = '<option value="">Sin ubicación</option>' +
    ubs.map(u => `<option value="${u.id}">${escapeHtml(u.denominacion)}</option>`).join('');
}

async function pintarListaPuertas() {
  const cont = document.getElementById('listaPuertas');
  if (!cont) return;

  const lista = await dbGetByIndex('puertas', 'clienteId', getPuertaClienteActual());

  if (!lista.length) {
    cont.innerHTML = '<p class="ubic-vacio">Este cliente aún no tiene puertas registradas.</p>';
    return;
  }

  lista.sort((a, b) => (a.proximaRevision || '9999').localeCompare(b.proximaRevision || '9999'));

  const estados = {
    operativa: '🟢 Operativa',
    averiada: '🔴 Averiada',
    fuera_servicio: '⚪ Fuera de servicio'
  };

  cont.innerHTML = lista.map(p => {
    const tipo = getTipoPuerta(p.tipo);
    const dias = diasHasta(p.proximaRevision);
    let aviso = '';
    if (dias !== null) {
      if (dias < 0)       aviso = ' <span style="color:#ef4444">🔴 Atrasada ' + Math.abs(dias) + 'd</span>';
      else if (dias <= 3) aviso = ' <span style="color:#f97316">🟠 Revisar en ' + dias + 'd</span>';
      else if (dias <= 7) aviso = ' <span style="color:#22c55e">🟢 Próxima en ' + dias + 'd</span>';
    }
    return `
    <div class="ubic-item">
      <div>
        <strong>${escapeHtml(p.nombre)}</strong>
        <small>· ${tipo ? tipo.nombre : p.tipo}</small><br>
        <small>${estados[p.estado] || p.estado}</small><br>
        <small>Próx. revisión: ${p.proximaRevision || '—'}${aviso}</small>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm btn-primary" onclick="abrirRevision('${p.id}')">🔧 Revisar</button>
        <button class="btn btn-sm btn-danger" onclick="eliminarPuerta('${p.id}')">Eliminar</button>
      </div>
    </div>`;
  }).join('');
}

async function guardarPuerta() {
  const nombre = document.getElementById('pu_nombre').value.trim();
  const tipo   = document.getElementById('pu_tipo').value;
  const estado = document.getElementById('pu_estado').value;
  const ubId   = document.getElementById('pu_ubicacion').value;
  const notas  = document.getElementById('pu_notas').value.trim();

  if (!nombre) return alert('El nombre de la puerta es obligatorio');

  const hoy = new Date().toISOString().slice(0, 10);

  await dbAdd('puertas', {
    id: 'PRT-' + Date.now(),
    nombre,
    tipo,
    clienteId: getPuertaClienteActual(),
    ubicacionId: ubId || null,
    estado,
    notas,
    ultimaRevision: null,
    tecnicoUltimo: null,
    proximaRevision: calcularProximaRevision(tipo, null),
    createdAt: hoy
  });

  document.getElementById('pu_nombre').value = '';
  document.getElementById('pu_notas').value = '';
  document.getElementById('pu_nombre').focus();

  pintarListaPuertas();
}

async function eliminarPuerta(id) {
  if (!confirm('¿Eliminar esta puerta? (No borra sus revisiones históricas)')) return;
  await dbDelete('puertas', id);
  pintarListaPuertas();
}

// ==========================================
// REVISIONES DE PUERTAS
// ==========================================

let revisionPuertaActual = null;

async function abrirRevision(puertaId) {
  const puerta = await dbGet('puertas', puertaId);
  if (!puerta) return alert('Puerta no encontrada');
  revisionPuertaActual = puerta;

  const tipo = getTipoPuerta(puerta.tipo);
  if (!tipo) return alert('Tipo de puerta no reconocido: ' + puerta.tipo);

  const checklistHTML = tipo.checklist.map((item, i) => `
    <div class="rev-item" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(148,163,184,.15)">
      <span style="flex:1;min-width:140px">${escapeHtml(item)}</span>
      <select id="rev_estado_${i}" style="width:140px">
        <option value="">— Sin revisar —</option>
        <option value="ok">✅ Correcto</option>
        <option value="desgaste">⚠️ Desgaste</option>
        <option value="correctivo">🔴 Necesita correctivo</option>
      </select>
      <input type="text" id="rev_hallazgo_${i}" placeholder="Observación (opcional)" style="flex:1;min-width:120px">
    </div>
  `).join('');

  const empleados = await dbGetAll('empleados');
  const empOpts = empleados.map(e => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join('');

  const overlay = document.createElement('div');
  overlay.id = 'overlayRevision';
  overlay.dataset.puerta = puertaId;
  overlay.className = 'modal-overlay open';

  overlay.innerHTML =
    '<div class="modal modal-ubic">' +
      '<div class="modal-header">' +
        '<h3>🔧 Revisión · ' + escapeHtml(puerta.nombre) + ' (' + tipo.nombre + ')</h3>' +
        '<button class="modal-close" onclick="cerrarRevision()">×</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="ubic-form">' +
          '<label style="font-size:12px;color:var(--text-muted)">Fecha de revisión</label>' +
          '<input type="date" id="rev_fecha" value="' + new Date().toISOString().slice(0, 10) + '">' +
          '<label style="font-size:12px;color:var(--text-muted)">Técnico</label>' +
          '<select id="rev_tecnico">' + empOpts + '</select>' +
        '</div>' +
        '<h4 style="margin:16px 0 4px">Checklist · ' + tipo.nombre + '</h4>' +
        checklistHTML +
        '<div class="ubic-form" style="margin-top:16px">' +
          '<label style="font-size:12px;color:var(--text-muted)">Estado de la puerta tras la revisión</label>' +
          '<select id="rev_estado_final">' +
            '<option value="operativa">🟢 Operativa</option>' +
            '<option value="averiada">🔴 Averiada</option>' +
            '<option value="fuera_servicio">⚪ Fuera de servicio</option>' +
          '</select>' +
          '<input type="text" id="rev_correctivo" placeholder="Correctivos realizados (opcional)">' +
          '<textarea id="rev_notas" rows="2" placeholder="Notas generales (opcional)"></textarea>' +
          '<button class="btn btn-primary" onclick="guardarRevision()">💾 Guardar revisión</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
}

function cerrarRevision() {
  document.getElementById('overlayRevision')?.remove();
  revisionPuertaActual = null;
}

async function guardarRevision() {
  const puerta = revisionPuertaActual;
  if (!puerta) return;

  const tipo = getTipoPuerta(puerta.tipo);
  const fecha = document.getElementById('rev_fecha').value;
  if (!fecha) return alert('La fecha de revisión es obligatoria');

  const items = [];
  let sinRevisar = 0;
  tipo.checklist.forEach((concepto, i) => {
    const estado   = document.getElementById('rev_estado_' + i)?.value || '';
    const hallazgo = document.getElementById('rev_hallazgo_' + i)?.value.trim() || '';
    if (!estado) sinRevisar++;
    items.push({ concepto, estado, hallazgo });
  });

  if (sinRevisar > 0) {
    if (!confirm(`Quedan ${sinRevisar} punto(s) del checklist sin marcar. ¿Guardar igualmente?`)) return;
  }

  const estadoFinal = document.getElementById('rev_estado_final').value;
  const tecnicoId   = document.getElementById('rev_tecnico').value || null;

  const revision = {
    id: 'REV-' + Date.now(),
    puertaId: puerta.id,
    clienteId: puerta.clienteId,
    fecha,
    tecnicoId,
    items,
    hallazgos: items.filter(i => i.hallazgo).map(i => `${i.concepto}: ${i.hallazgo}`).join(' | '),
    correctivo: document.getElementById('rev_correctivo').value.trim(),
    estadoTrasRevision: estadoFinal,
    notas: document.getElementById('rev_notas').value.trim(),
    createdAt: new Date().toISOString()
  };

  await dbAdd('revisiones', revision);

  const puertaActualizada = {
    ...puerta,
    ultimaRevision: fecha,
    estado: estadoFinal,
    tecnicoUltimo: tecnicoId,
    proximaRevision: calcularProximaRevision(puerta.tipo, fecha)
  };
  await dbPut('puertas', puertaActualizada);

  cerrarRevision();
  showToast('Revisión registrada · Próx.: ' + puertaActualizada.proximaRevision);
  pintarListaPuertas();
}

// ==========================================
// RONDA DE REVISIONES (hoja de trabajo por ruta)
// ==========================================

let rondaPuertas = [];

window.abrirRondaRevisiones = async function (rutaId) {
  const hoy = new Date();
  const puertas = await dbGetAll('puertas');
  const clientes = await dbGetAll('clientes');

  const treintaDias = new Date(hoy); treintaDias.setDate(hoy.getDate() + 30);
  const pendientes = puertas.filter(p => {
    if (!p.proximaRevision) return false;
    return new Date(p.proximaRevision) <= treintaDias;
  });

  const grupos = {};
  pendientes.forEach(p => {
    if (!grupos[p.clienteId]) grupos[p.clienteId] = [];
    grupos[p.clienteId].push(p);
  });

  const numClientes = Object.keys(grupos).length;
  if (numClientes === 0) {
    showToast('✅ No hay revisiones pendientes.', 'info');
    return;
  }

  let html = '';
  const totalPuertas = pendientes.length;

  Object.entries(grupos).forEach(([clienteId, lista]) => {
    const cliente = clientes.find(c => c.id === clienteId);
    const nombreCliente = cliente ? cliente.nombre : 'Cliente desconocido';

    html += `
            <div class="rd-grupo" data-cliente="${clienteId}" style="margin-bottom:28px;">
        <h4 style="display:flex;align-items:center;gap:8px;margin:0 0 12px 0;color:#1e293b;">
          <i class="fas fa-store" style="color:#3b82f6;"></i> ${escapeHtml(nombreCliente)}
          <span class="badge" style="background:#dbeafe;color:#2563eb;">${lista.length} puerta(s)</span>
        </h4>
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
          <thead>
            <tr style="background:#f1f5f9;border-bottom:2px solid #e2e8f0;">
              <th style="text-align:left;padding:8px 10px;width:35%;">Puerta</th>
              <th style="text-align:center;padding:8px 10px;width:15%;">Hallazgo</th>
              <th style="text-align:center;padding:8px 10px;width:15%;">Correctivo</th>
              <th style="text-align:center;padding:8px 10px;width:15%;">Resultado</th>
              <th style="text-align:center;padding:8px 10px;width:20%;">Detalle</th>
            </tr>
          </thead>
          <tbody>
            ${lista.map((p) => {
              const tipo = getTipoPuerta(p.tipo);
              const nombreTipo = tipo ? tipo.nombre : p.tipo;
              const idKey = p.id;
              return `
                <tr style="border-bottom:1px solid #f1f5f9;">
                  <td style="padding:8px 10px;vertical-align:top;">
                    <strong>${escapeHtml(p.nombre || '')}</strong><br>
                    <small style="color:#64748b;">${escapeHtml(nombreTipo)}</small>
                  </td>
                  <td style="text-align:center;padding:8px 10px;vertical-align:top;">
                    <input type="checkbox" class="rd-hallazgo-check" data-puerta="${idKey}" onchange="rdToggleDetalle(this)">
                  </td>
                  <td style="text-align:center;padding:8px 10px;vertical-align:top;">
                    <input type="checkbox" class="rd-correctivo-check" data-puerta="${idKey}" onchange="rdValidar()">
                  </td>
                  <td style="text-align:center;padding:8px 10px;vertical-align:top;">
                    <select class="rd-resultado-select" data-puerta="${idKey}" onchange="rdValidar()">
                      <option value="">—</option>
                      <option value="ok">OK</option>
                      <option value="reparada">Reparada</option>
                      <option value="pendiente">Pendiente</option>
                      <option value="repuesto">Repuesto</option>
                    </select>
                  </td>
                  <td style="padding:8px 10px;vertical-align:top;">
                    <textarea class="rd-detalle-input" data-puerta="${idKey}" rows="1" placeholder="Descripción..."
                      style="width:100%;min-height:32px;display:none;border:1px solid #cbd5e1;border-radius:4px;padding:4px 8px;font-size:0.85rem;resize:vertical;"
                      oninput="rdValidar()"></textarea>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  });

  const overlay = document.createElement('div');
  overlay.id = 'modal-revision-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div class="card" style="max-width:900px;width:100%;max-height:88vh;overflow-y:auto;background:#fff;border-radius:10px;">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e5e7eb;padding:16px 20px;">
        <h3 style="margin:0;"><i class="fas fa-clipboard-check" style="color:#3b82f6;margin-right:8px;"></i>Ronda de Revisiones (${numClientes} clientes · ${totalPuertas} puertas)</h3>
        <button onclick="cerrarModalRevision()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#6b7280;">&times;</button>
      </div>
      <div class="card-body" style="padding:20px;">
        ${html}
        <hr style="margin:20px 0;">
        <label id="rd-final-label" style="display:flex;align-items:center;gap:10px;font-size:1.05rem;font-weight:700;color:#dc2626;opacity:.5;padding:16px;background:#fef2f2;border-radius:8px;">
          <input type="checkbox" id="rd-check-final" disabled>
          ✅ Revisión de ruta completa — todas las puertas revisadas
        </label>
        <button id="rd-btn-guardar" class="btn btn-primary" style="width:100%;margin-top:16px;padding:12px;" disabled onclick="guardarRondaRevision()">
          <i class="fas fa-save"></i> Cerrar revisión y sumar 6 meses
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('rd-check-final').addEventListener('change', e => {
    const btn = document.getElementById('rd-btn-guardar');
    if (btn) btn.disabled = !e.target.checked;
  });
};

// ── Mostrar textarea si hallazgo está marcado ──
window.rdToggleDetalle = function (checkbox) {
  const fila = checkbox.closest('tr');
  const textarea = fila.querySelector('.rd-detalle-input');
  textarea.style.display = checkbox.checked ? 'block' : 'none';
  rdValidar();
};

// ── Validar: activar final solo si TODAS las puertas tienen los 3 campos ──
window.rdValidar = function () {
  const checks = [...document.querySelectorAll('.rd-hallazgo-check')];
  if (checks.length === 0) return;

  let todasRevisadas = true;
  checks.forEach(cb => {
    const puerta = cb.dataset.puerta;
    const correctivo = document.querySelector(`.rd-correctivo-check[data-puerta="${puerta}"]`);
    const resultado = document.querySelector(`.rd-resultado-select[data-puerta="${puerta}"]`);
    if (!cb.checked || !correctivo?.checked || !resultado?.value) todasRevisadas = false;
  });

  const final = document.getElementById('rd-check-final');
  const btn = document.getElementById('rd-btn-guardar');
  const label = document.getElementById('rd-final-label');
  if (!final || !btn || !label) return;

  final.disabled = !todasRevisadas;
  label.style.opacity = todasRevisadas ? '1' : '.5';
  label.style.color = todasRevisadas ? '#16a34a' : '#dc2626';
  label.style.background = todasRevisadas ? '#f0fdf4' : '#fef2f2';
  btn.disabled = !(todasRevisadas && final.checked);
};

window.cerrarModalRevision = function () {
  document.getElementById('modal-revision-overlay')?.remove();
};

// ── Guardar: nueva fecha (+6 meses) + datos revisados ──
window.guardarRondaRevision = async function () {
  const checkFinal = document.getElementById('rd-check-final');
  if (!checkFinal || !checkFinal.checked) {
    showToast('⚠️ Debes marcar el checklist final para cerrar la revisión.', 'error');
    return;
  }

  const detalles = {}, correctivos = {}, resultados = {};
  document.querySelectorAll('.rd-correctivo-check').forEach(i => correctivos[i.dataset.puerta] = i.checked);
  document.querySelectorAll('.rd-resultado-select').forEach(i => resultados[i.dataset.puerta] = i.value);
  document.querySelectorAll('.rd-detalle-input').forEach(i => detalles[i.dataset.puerta] = i.value.trim());

  const nuevaFecha = new Date();
  nuevaFecha.setMonth(nuevaFecha.getMonth() + 6);
  const iso = nuevaFecha.toISOString().slice(0, 10);
  const hoy = new Date().toISOString().slice(0, 10);

  const puertas = await dbGetAll('puertas');
  const treintaDias = new Date(); treintaDias.setDate(treintaDias.getDate() + 30);
  let actualizadas = 0;

  for (const p of puertas) {
    if (!p.proximaRevision || new Date(p.proximaRevision) > treintaDias) continue;
    await dbPut('puertas', {
      ...p,
      proximaRevision: iso,
      ultimaRevision: hoy,
      hallazgo: detalles[p.id] ?? p.hallazgo,
      correctivo: correctivos[p.id] ? 'Sí' : p.correctivo,
      resultado: resultados[p.id] || p.resultado
    });
    actualizadas++;
  }

  console.log(`✅ ${actualizadas} puertas actualizadas. Próxima revisión: ${iso}`);
  cerrarModalRevision();
  showToast(`✅ ${actualizadas} puerta(s) cerradas · Próx.: ${iso}`, 'success');
  actualizarBadgeRevisiones();
};

// ==========================================
// HISTÓRICO DE PUERTAS Y REVISIONES (Cliente)
// ==========================================

async function verHistoricoPuertas(clienteId) {
  const cliente = await dbGet('clientes', clienteId);
  if (!cliente) return alert('Cliente no encontrado');

  const puertas = await dbGetByIndex('puertas', 'clienteId', clienteId);
  const todasRevs = await dbGetAll('revisiones');
  const empleados = await dbGetAll('empleados');

  const nombreTecnico = id => {
    const e = empleados.find(x => x.id === id);
    return e ? e.nombre : '—';
  };

  const estadosIcon = { operativa: '🟢', averiada: '🔴', fuera_servicio: '⚪' };
  const estadoItemIcon = { ok: '✅', desgaste: '⚠️', correctivo: '🔴' };

  let bodyHTML = '';

  if (!puertas.length) {
    bodyHTML = '<p class="ubic-vacio">Este cliente aún no tiene puertas registradas.</p>';
  } else {
    puertas.sort((a, b) => a.nombre.localeCompare(b.nombre));

    bodyHTML = puertas.map(p => {
      const revs = todasRevs
        .filter(r => r.puertaId === p.id)
        .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

      const tipo = getTipoPuerta(p.tipo);
      const dias = diasHasta(p.proximaRevision);
      let aviso = '';
      if (dias !== null) {
        if (dias < 0)       aviso = ' <span style="color:#ef4444">🔴 Atrasada ' + Math.abs(dias) + 'd</span>';
        else if (dias <= 3) aviso = ' <span style="color:#f97316">🟠 En ' + dias + 'd</span>';
        else if (dias <= 7) aviso = ' <span style="color:#22c55e">🟢 En ' + dias + 'd</span>';
      }

      const historialHTML = revs.length ? revs.map(r => `
        <div style="border-left:3px solid var(--border,#334155); padding:8px 12px; margin:8px 0 8px 8px;">
          <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px">
            <strong>📅 ${r.fecha}</strong>
            <span>${estadosIcon[r.estadoTrasRevision] || ''} Tras revisión: ${r.estadoTrasRevision}</span>
          </div>
          <small style="color:var(--text-muted)">👷 ${escapeHtml(nombreTecnico(r.tecnicoId))}</small>
          <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:6px">
            ${(r.items || []).map(i => `<span style="font-size:12px;background:rgba(148,163,184,.12);padding:2px 8px;border-radius:10px">${estadoItemIcon[i.estado] || '⬜'} ${escapeHtml(i.concepto)}</span>`).join('')}
          </div>
          ${r.hallazgos ? `<div style="margin-top:6px;font-size:13px">🔎 ${escapeHtml(r.hallazgos)}</div>` : ''}
          ${r.correctivo ? `<div style="margin-top:4px;font-size:13px">🔧 ${escapeHtml(r.correctivo)}</div>` : ''}
          ${r.notas && r.notas !== 'Ronda de revisiones' ? `<div style="margin-top:4px;font-size:13px;color:var(--text-muted)">📝 ${escapeHtml(r.notas)}</div>` : ''}
        </div>
      `).join('') : '<p style="color:var(--text-muted);font-size:13px;margin:8px 0 8px 12px">Sin revisiones registradas todavía.</p>';

      return `
      <details style="border:1px solid rgba(148,163,184,.2); border-radius:8px; margin-bottom:8px; padding:10px 12px">
        <summary style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px">
          <span><strong>${escapeHtml(p.nombre)}</strong> <small style="color:var(--text-muted)">· ${tipo ? tipo.nombre : p.tipo}</small></span>
          <span style="font-size:13px">
            ${estadosIcon[p.estado] || ''} ${p.estado} · Próx: ${p.proximaRevision || '—'}${aviso}
            <small style="color:var(--text-muted)">(${revs.length} rev.)</small>
          </span>
        </summary>
        <div style="margin-top:8px">${historialHTML}</div>
      </details>`;
    }).join('');
  }

  openModal(
    '🕓 Histórico de puertas · ' + cliente.nombre,
    '<div style="max-height:60vh;overflow-y:auto">' + bodyHTML + '</div>',
    '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>'
  );
}

// ═══════════════════════════════════════════════════════════
// Exponer shell de navegación (DESPUÉS de definirlas)
// ═══════════════════════════════════════════════════════════
window.pages = window.pages || {};
window.pages.setupNavigation = setupNavigation;
window.pages.setupMobileMenu = setupMobileMenu;
window.navigateTo = navigateTo;
window.getCurrentPage = () => currentPage;
window.getCurrentCadenId = () => currentCadenId;
window.setCurrentCadenId = (id) => { currentCadenId = id; window.currentCadenId = id; };
window.showToast = showToast;
window.diasHasta = diasHasta;
window.closeAllModals = closeAllModals;

// ═══════════════════════════════════════════════════════════
// FIN app.js — no registrar el SW aquí (se hace en registerServiceWorker)
// ═══════════════════════════════════════════════════════════

// ── Red de seguridad: nunca pasar HTMLElement a filtros de PostgREST ──
(function() {
  const sbClient = window.sb || window.supabase;
  if (!sbClient) return;
  const origFrom = sbClient.from.bind(sbClient);
  sbClient.from = function(table) {
    const q = origFrom(table);
    ['eq','in','or','gte','lte','neq'].forEach(op => {
      const orig = q[op]?.bind(q);
      if (!orig) return;
      q[op] = (...args) => orig(...args.map(a => {
        if (a && typeof a === 'object' && (a.tagName || a.target)) {
          console.warn(`⚠️ ${table}.${op}() recibió elemento DOM — normalizado automáticamente`);
          return a.value ?? a.target?.value ?? null;
        }
        return a;
      }));
    });
    return q;
  };
})();