// Incidencias: el administrador las asigna a un técnico (con datos y ubicación).
(function () {
  const ESTADOS = {
    pendiente: { label: 'Pendiente', color: '#f59e0b' },
    aceptada: { label: 'Aceptada', color: '#2563eb' },
    en_camino: { label: 'En camino', color: '#7c3aed' },
    resuelta: { label: 'Resuelta', color: '#16a34a' }
  };
  const esc = value => escapeHtml(String(value ?? ''));

  function estadoBadge(estado) {
    const info = ESTADOS[estado] || { label: estado || '—', color: '#6b7280' };
    return `<span class="badge" style="background:${info.color}22;color:${info.color};border:1px solid ${info.color}55">${esc(info.label)}</span>`;
  }

  function prioridadBadge(prioridad) {
    return prioridad === 'urgente'
      ? '<span class="badge" style="background:#dc262622;color:#dc2626;border:1px solid #dc262655">🚨 Urgente</span>'
      : '<span class="badge" style="background:#6b728022;color:#6b7280;border:1px solid #6b728055">Normal</span>';
  }

  function mapsUrl(inc) {
    if (inc.lat && inc.lng) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(inc.lat + ',' + inc.lng)}`;
    if (inc.direccion) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(inc.direccion)}`;
    return '';
  }

  function telHref(phone) {
    const clean = String(phone || '').replace(/[^\d+]/g, '');
    return clean ? `tel:${clean}` : '';
  }

  async function loadIncidencias() {
    if (navigator.onLine) {
      const { data, error } = await window.supabaseDB.from('incidencias').select();
      if (!error) return fromJSArray(data || []);
      console.warn('[Incidencias]', error.message);
    }
    return dbGetAll('incidencias');
  }

  const isActive = inc => inc.estado !== 'resuelta';
  const sortList = list => list.slice().sort((a, b) =>
    (isActive(b) - isActive(a)) ||
    ((b.prioridad === 'urgente') - (a.prioridad === 'urgente')) ||
    String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  window.refreshIncidenciasBadge = async function () {
    if (!window.authState?.user || !window.setNavBadge) return;
    try {
      const list = await loadIncidencias();
      const count = window.isAdmin()
        ? list.filter(i => isActive(i) && !i.empleadoId).length
        : list.filter(i => i.estado === 'pendiente').length;
      window.setNavBadge('incidencias', count);
    } catch (error) {
      console.warn('[Incidencias] badge:', error.message);
    }
  };

  // ───────── Administrador ─────────
  async function renderAdmin(container) {
    const filter = container.dataset.incFilter || 'activas';
    const list = sortList(await loadIncidencias());
    const shown = list.filter(i => filter === 'todas' || (filter === 'activas' ? isActive(i) : !isActive(i)));
    container.innerHTML = `
      <div class="page-header"><div><h2>Incidencias</h2><p>Asigna los avisos de los clientes a un técnico</p></div>
        <div class="header-actions"><button class="btn btn-primary" id="incNew"><i class="fas fa-plus"></i> Nueva incidencia</button></div></div>
      <div class="search-bar"><select id="incFilter">
        <option value="activas" ${filter === 'activas' ? 'selected' : ''}>Activas</option>
        <option value="resueltas" ${filter === 'resueltas' ? 'selected' : ''}>Resueltas</option>
        <option value="todas" ${filter === 'todas' ? 'selected' : ''}>Todas</option></select></div>
      <div class="card"><div class="table-wrapper"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Incidencia</th><th>Prioridad</th><th>Técnico</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        ${shown.map(i => `<tr>
          <td>${esc(formatDate(String(i.createdAt || '').slice(0, 10)))}</td>
          <td><strong>${esc(i.clienteNombre)}</strong><div style="font-size:12px;color:var(--text-muted)">${esc(i.direccion)}</div></td>
          <td style="max-width:280px">${esc(i.descripcion)}${i.notaTecnico ? `<div style="font-size:12px;color:var(--text-muted)">Técnico: ${esc(i.notaTecnico)}</div>` : ''}</td>
          <td>${prioridadBadge(i.prioridad)}</td>
          <td>${i.empleadoNombre ? esc(i.empleadoNombre) : '<span style="color:#dc2626">Sin asignar</span>'}</td>
          <td>${estadoBadge(i.estado)}</td>
          <td class="actions-cell">
            <button class="btn btn-outline btn-sm btn-icon" title="Editar" data-inc-edit="${esc(i.id)}"><i class="fas fa-pen"></i></button>
            ${mapsUrl(i) ? `<a class="btn btn-outline btn-sm btn-icon" title="Ver ubicación" target="_blank" rel="noopener" href="${esc(mapsUrl(i))}"><i class="fas fa-location-dot"></i></a>` : ''}
            <button class="btn btn-outline btn-sm btn-icon" title="Eliminar" data-inc-del="${esc(i.id)}"><i class="fas fa-trash"></i></button>
          </td></tr>`).join('') || '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted)">Sin incidencias</td></tr>'}
      </tbody></table></div></div>`;
    container.querySelector('#incNew').onclick = () => showIncidenciaForm();
    container.querySelector('#incFilter').onchange = event => { container.dataset.incFilter = event.target.value; renderAdmin(container); };
    container.querySelectorAll('[data-inc-edit]').forEach(btn => btn.onclick = () => showIncidenciaForm(btn.dataset.incEdit));
    container.querySelectorAll('[data-inc-del]').forEach(btn => btn.onclick = () =>
      confirmDelete('esta incidencia', async () => {
        await dbDelete('incidencias', btn.dataset.incDel);
        showToast('Incidencia eliminada');
        renderAdmin(container);
        window.refreshIncidenciasBadge();
      }));
    window.refreshIncidenciasBadge();
  }

  async function getEmployeesWithAccess() {
    try {
      const { data } = await window.supabaseDB.from('user_profiles').select('employee_id,role,is_active');
      return new Set((data || []).filter(p => p.role === 'technician' && p.is_active && p.employee_id).map(p => String(p.employee_id)));
    } catch (_) {
      return null;
    }
  }

  window.showIncidenciaForm = async function (id) {
    const [clientes, empleados, withAccess, existing] = await Promise.all([
      dbGetAll('clientes'), dbGetAll('empleados'), getEmployeesWithAccess(),
      id ? loadIncidencias().then(list => list.find(i => String(i.id) === String(id))) : Promise.resolve(null)
    ]);
    const inc = existing || { prioridad: 'normal', estado: 'pendiente' };
    let coords = inc.lat && inc.lng ? { lat: inc.lat, lng: inc.lng } : null;

    const form = `<div class="form-grid">
      <div class="form-group full"><label>Cliente</label><select id="inc_cliente">
        <option value="">— Cliente no registrado —</option>
        ${clientes.map(c => `<option value="${esc(c.id)}" ${String(inc.clienteId) === String(c.id) ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div>
      <div class="form-group"><label>Nombre del cliente *</label><input id="inc_nombre" value="${esc(inc.clienteNombre)}"></div>
      <div class="form-group"><label>Teléfono</label><input id="inc_tel" type="tel" value="${esc(inc.telefono)}"></div>
      <div class="form-group full"><label>Dirección / ubicación</label><input id="inc_dir" value="${esc(inc.direccion)}" placeholder="Calle, número, localidad">
        <small id="inc_geo" style="color:var(--text-muted);font-size:11px">${coords ? '✅ Con coordenadas' : 'El técnico verá un botón “Cómo llegar” con esta dirección'}</small></div>
      <div class="form-group full"><label>Descripción de la incidencia *</label><textarea id="inc_desc" rows="3">${esc(inc.descripcion)}</textarea></div>
      <div class="form-group"><label>Prioridad</label><select id="inc_prio">
        <option value="normal" ${inc.prioridad !== 'urgente' ? 'selected' : ''}>Normal</option>
        <option value="urgente" ${inc.prioridad === 'urgente' ? 'selected' : ''}>🚨 Urgente</option></select></div>
      <div class="form-group"><label>Asignar a</label><select id="inc_emp">
        <option value="">— Sin asignar —</option>
        ${empleados.map(e => `<option value="${esc(e.id)}" ${String(inc.empleadoId) === String(e.id) ? 'selected' : ''}>${esc(e.nombre)}${withAccess && !withAccess.has(String(e.id)) ? ' (sin acceso a la app)' : ''}</option>`).join('')}</select></div>
      ${existing ? `<div class="form-group"><label>Estado</label><select id="inc_estado">${Object.entries(ESTADOS).map(([k, v]) => `<option value="${k}" ${inc.estado === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>` : ''}
    </div>`;
    const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="incSave"><i class="fas fa-paper-plane"></i> Guardar y avisar</button>';
    openModal(existing ? 'Editar incidencia' : 'Nueva incidencia', form, footer);

    const $ = sel => document.getElementById(sel);
    $('inc_cliente').onchange = () => {
      const cliente = clientes.find(c => String(c.id) === $('inc_cliente').value);
      if (!cliente) { coords = null; return; }
      $('inc_nombre').value = cliente.nombre || '';
      $('inc_tel').value = cliente.telefono || '';
      $('inc_dir').value = cliente.direccion || '';
      coords = cliente.lat && cliente.lng ? { lat: cliente.lat, lng: cliente.lng } : null;
      $('inc_geo').textContent = coords ? '✅ Con coordenadas' : 'El técnico verá un botón “Cómo llegar” con esta dirección';
    };
    $('inc_dir').oninput = () => { coords = null; $('inc_geo').textContent = 'El técnico verá un botón “Cómo llegar” con esta dirección'; };

    $('incSave').onclick = async () => {
      const nombre = $('inc_nombre').value.trim();
      const descripcion = $('inc_desc').value.trim();
      if (!nombre || !descripcion) { showToast('Indica el cliente y la descripción', 'error'); return; }
      const empleadoId = $('inc_emp').value || null;
      const empleado = empleados.find(e => String(e.id) === String(empleadoId));
      const reassigned = existing && String(existing.empleadoId || '') !== String(empleadoId || '');
      const data = {
        ...(existing || {}),
        id: existing ? existing.id : window.db.nextId('INC'),
        clienteId: $('inc_cliente').value || null,
        clienteNombre: nombre,
        telefono: $('inc_tel').value.trim(),
        direccion: $('inc_dir').value.trim(),
        lat: coords ? coords.lat : null,
        lng: coords ? coords.lng : null,
        descripcion,
        prioridad: $('inc_prio').value,
        empleadoId,
        empleadoNombre: empleado ? empleado.nombre : '',
        estado: reassigned ? 'pendiente' : ($('inc_estado')?.value || 'pendiente'),
        createdBy: existing?.createdBy || window.authState.user.id
      };
      if (data.estado !== 'resuelta') data.resueltaAt = null;
      $('incSave').disabled = true;
      try {
        await dbPut('incidencias', data);
        closeModal();
        showToast(empleado ? `Incidencia asignada a ${empleado.nombre}` : 'Incidencia guardada');
        navigateTo('incidencias');
      } catch (error) {
        console.error(error);
        showToast('No se pudo guardar: ' + error.message, 'error');
        $('incSave').disabled = false;
      }
    };
  };

  // ───────── Técnico ─────────
  const NEXT_ACTION = {
    pendiente: { estado: 'aceptada', label: 'Aceptar', icon: 'fa-check' },
    aceptada: { estado: 'en_camino', label: 'Voy de camino', icon: 'fa-van-shuttle' },
    en_camino: { estado: 'resuelta', label: 'Marcar como resuelta', icon: 'fa-circle-check' }
  };

  function techCard(inc) {
    const maps = mapsUrl(inc);
    const tel = telHref(inc.telefono);
    const action = NEXT_ACTION[inc.estado];
    return `<div class="card" style="margin-bottom:12px;border-left:4px solid ${inc.prioridad === 'urgente' ? '#dc2626' : (ESTADOS[inc.estado]?.color || '#6b7280')}">
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <strong style="font-size:16px">${esc(inc.clienteNombre)}</strong><span>${prioridadBadge(inc.prioridad)} ${estadoBadge(inc.estado)}</span></div>
        <p style="margin:6px 0">${esc(inc.descripcion)}</p>
        ${inc.direccion ? `<p style="margin:4px 0;color:var(--text-muted)"><i class="fas fa-location-dot"></i> ${esc(inc.direccion)}</p>` : ''}
        ${inc.notaTecnico ? `<p style="margin:4px 0;font-size:13px"><em>Tu nota: ${esc(inc.notaTecnico)}</em></p>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          ${maps ? `<a class="btn btn-outline" target="_blank" rel="noopener" href="${esc(maps)}"><i class="fas fa-route"></i> Cómo llegar</a>` : ''}
          ${tel ? `<a class="btn btn-outline" href="${esc(tel)}"><i class="fas fa-phone"></i> Llamar</a>` : ''}
          ${action ? `<button class="btn btn-primary" data-inc-next="${esc(inc.id)}" data-estado="${action.estado}"><i class="fas ${action.icon}"></i> ${action.label}</button>` : ''}
          <button class="btn btn-outline" data-inc-parte="${esc(inc.id)}"><i class="fas fa-clipboard-list"></i> Crear parte</button>
        </div></div></div>`;
  }

  async function renderTech(container) {
    const myEmployee = String(window.authState.profile?.employee_id || '');
    const all = sortList((await loadIncidencias()).filter(i => String(i.empleadoId || '') === myEmployee));
    const active = all.filter(isActive);
    const done = all.filter(i => !isActive(i)).slice(0, 10);
    container.innerHTML = `
      <div class="page-header"><div><h2>Mis incidencias</h2><p>Avisos de clientes asignados a ti</p></div></div>
      ${active.map(techCard).join('') || '<div class="card"><div class="card-body">No tienes incidencias pendientes. 👌</div></div>'}
      ${done.length ? `<h3 style="margin:20px 0 10px">Resueltas recientes</h3>${done.map(techCard).join('')}` : ''}`;
    container.querySelectorAll('[data-inc-next]').forEach(btn => btn.onclick = async () => {
      const estado = btn.dataset.estado;
      let nota = null;
      if (estado === 'resuelta') {
        nota = prompt('Nota de cierre (opcional): ¿qué se hizo?', '');
        if (nota === null) return;
      }
      btn.disabled = true;
      const { error } = await window.supabaseDB.rpc('update_incidencia_estado', { p_id: btn.dataset.incNext, p_estado: estado, p_nota: nota });
      if (error) { showToast('No se pudo actualizar: ' + error.message, 'error'); btn.disabled = false; return; }
      showToast('Estado actualizado');
      renderTech(container);
      window.refreshIncidenciasBadge();
    });
    container.querySelectorAll('[data-inc-parte]').forEach(btn => btn.onclick = async () => {
      const inc = all.find(i => String(i.id) === btn.dataset.incParte);
      await navigateTo('partesTrabajo');
      showParteForm(null, { clienteId: inc.clienteId || '', descripcion: inc.descripcion || '' });
    });
    window.refreshIncidenciasBadge();
  }

  window.render_incidencias = async function (container) {
    return window.isAdmin() ? renderAdmin(container) : renderTech(container);
  };

  // Tarjeta de incidencias en el panel del técnico
  const originalTechDashboard = window.renderTechnicianDashboard;
  if (originalTechDashboard) {
    window.renderTechnicianDashboard = async function (container) {
      await originalTechDashboard(container);
      try {
        const myEmployee = String(window.authState.profile?.employee_id || '');
        const active = sortList((await loadIncidencias()).filter(i => isActive(i) && String(i.empleadoId || '') === myEmployee));
        if (!active.length) return;
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<div class="card-header"><h3>Incidencias asignadas (${active.length})</h3><button class="btn btn-outline btn-sm" onclick="navigateTo('incidencias')">Ver todas</button></div>
          <div class="card-body">${active.slice(0, 4).map(i => `<p class="help-notice" style="border-left:4px solid ${i.prioridad === 'urgente' ? '#dc2626' : '#f59e0b'}"><strong>${esc(i.clienteNombre)}</strong> · ${esc(i.descripcion).slice(0, 90)}</p>`).join('')}</div>`;
        container.querySelector('.page-header')?.after(card);
      } catch (error) {
        console.warn('[Incidencias] panel:', error.message);
      }
    };
  }

  window.addEventListener('valgom:authenticated', () => window.refreshIncidenciasBadge());
  setInterval(() => { if (window.authState?.user && !document.hidden) window.refreshIncidenciasBadge(); }, 60000);
})();
