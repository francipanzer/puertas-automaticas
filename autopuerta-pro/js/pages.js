// ═══════════════════════════════════════════════════════════
//  DASHBOARD — ACTUALIZADO (CON BANNER PENDIENTES)
// ═══════════════════════════════════════════════════════════
let dashboardItvCountdownTimer=null;

function diasHastaFechaITV(value){
  const match=String(value||'').slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match) return null;
  const target=Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]));
  const today=new Date();
  const todayUtc=Date.UTC(today.getFullYear(),today.getMonth(),today.getDate());
  return Math.round((target-todayUtc)/86400000);
}

function textoCuentaAtrasITV(days){
  if(days<0){
    const overdue=Math.abs(days);
    return `<strong>CADUCADA</strong> hace ${overdue} día${overdue===1?'':'s'}`;
  }
  if(days===0) return '<strong>CADUCA HOY</strong>';
  return `Caduca en <strong>${days}</strong> día${days===1?'':'s'}`;
}

function actualizarCuentaAtrasITV(){
  if(dashboardItvCountdownTimer) clearTimeout(dashboardItvCountdownTimer);
  const countdowns=document.querySelectorAll('.itv-countdown[data-date]');
  countdowns.forEach(element=>{
    const days=diasHastaFechaITV(element.dataset.date);
    if(days===null) return;
    element.innerHTML=textoCuentaAtrasITV(days);
    const row=element.closest('.itv-alert-item');
    if(row){
      row.style.borderLeftColor=days<0?'#ef4444':'#f59e0b';
      row.style.backgroundColor=days<0?'rgba(239,68,68,.1)':'rgba(245,158,11,.1)';
    }
  });
  if(countdowns.length){
    const now=new Date();
    const nextMidnight=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,1);
    dashboardItvCountdownTimer=setTimeout(actualizarCuentaAtrasITV,Math.max(1000,nextMidnight-now));
  }
}

window.render_dashboard = async function(el){
  const clientes = await dbGetAll('clientes');
  const presupuestos = await dbGetAll('presupuestos');
  const partes = await dbGetAll('partesTrabajo');
  const vehiculos = await dbGetAll('vehiculos');
  const almacen = await dbGetAll('almacen');

  // ── Banner Pendientes (revisión de puertas + sin cadena) ──
  const pendientes = await getPendientesRevision();
  let bannerHTML = '';
  if (pendientes.length > 0) {
    const urgencias = pendientes.filter(p => p.dias < 0).length;
    const proximas = pendientes.length - urgencias;
    bannerHTML = `
      <div class="card" style="border-left:4px solid ${urgencias > 0 ? '#e11d48' : '#f59e0b'}; margin-bottom:20px;">
        <div class="card-body" style="padding:12px 16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <strong style="color:${urgencias > 0 ? '#e11d48' : '#f59e0b'};">
                <i class="fas fa-exclamation-triangle"></i> ${urgencias > 0 ? urgencias + ' vencidas' : ''}${urgencias > 0 && proximas > 0 ? ' · ' : ''}${proximas > 0 ? proximas + ' próximas' : ''}
              </strong>
              <small style="display:block;color:var(--text-muted);margin-top:4px;">
                ${pendientes.slice(0, 3).map(p => p.nombre).join(' · ')}${pendientes.length > 3 ? '...' : ''}
              </small>
            </div>
            <button class="btn btn-sm btn-outline" onclick="navigateTo('revisionesProgramadas')">Ver todo</button>
          </div>
        </div>
      </div>`;
  }

  // ── Métricas ──
  const totalPresupuesto = presupuestos.reduce((s,p)=>s+(p.total||0),0);
  const partesAbiertos = partes.filter(p=>p.estado==='abierto').length;
  const partesCompletados = partes.filter(p=>p.estado==='completado').length;
  const vehiculosEnRuta = vehiculos.filter(v=>v.estado==='en_ruta').length;
  const stockBajoItems = almacen.filter(a=>a.stock<=a.stockMinimo);

  // ── Lógica de Alertas ITV ──
  let alertasHTML = '';
  let numAlertas = 0;

  vehiculos.forEach(v => {
    const fechaStr = v.fechaITV || v.itv || v.fecha_itv;
    if(fechaStr){
      const dias=diasHastaFechaITV(fechaStr);
      if(dias!==null){
        let estado = 'ok';
        if(dias < 0) estado = 'caducada';
        else if(dias <= 30) estado = 'proxima';
        
        if(estado !== 'ok'){
          numAlertas++;
          const bgColor = estado === 'caducada' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)';
          const borderColor = estado === 'caducada' ? '#ef4444' : '#f59e0b';
          const fechaITVIso=String(fechaStr).slice(0,10);
          
          alertasHTML += `
            <div class="itv-alert-item" style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-radius:6px; margin-bottom:8px; border-left:4px solid ${borderColor}; background-color:${bgColor};">
              <div>
                <strong style="display:block; font-size:1rem;">${escapeHtml(v.marca)} ${escapeHtml(v.modelo)}</strong>
                <span style="font-weight:bold; color:#2563eb; font-size:0.95rem; letter-spacing:1px;">${escapeHtml(v.matricula)}</span>
                <small style="color:#6b7280; display:block; margin-top:2px;"><span class="itv-countdown" data-date="${fechaITVIso}">${textoCuentaAtrasITV(dias)}</span></small>
              </div>
              <button class="btn btn-primary btn-sm" onclick="navigateTo('vehiculos')">Ir</button>
            </div>
          `;
        }
      }
    }
  });

  // ── Próximas revisiones agrupadas por cliente ──
  const puertas = await dbGetAll('puertas');
  let revHTML = '';
  let numRev = 0;

  const pendientesPuertas = puertas.filter(p => p.proximaRevision && diasHasta(p.proximaRevision) <= 7);
  
  const grupos = {};
  pendientesPuertas.forEach(p => {
    if(!grupos[p.clienteId]) grupos[p.clienteId] = [];
    grupos[p.clienteId].push(p);
  });

  Object.entries(grupos).forEach(([clienteId, lista]) => {
    numRev++;
    const cliente = clientes.find(c => c.id === clienteId);
    const nombreCliente = cliente ? cliente.nombre : 'Cliente desconocido';
    
    const conteoTipos = {};
    lista.forEach(p => {
      const tipo = getTipoPuerta(p.tipo);
      const nombreTipo = tipo ? tipo.nombre : p.tipo;
      conteoTipos[nombreTipo] = (conteoTipos[nombreTipo] || 0) + 1;
    });
    
    const resumenTipos = Object.entries(conteoTipos)
      .map(([tipo, cant]) => `${tipo} ×${cant}`)
      .join(', ');
    
    const proximaFecha = lista.map(p=>p.proximaRevision).sort()[0];
    const diasMin = diasHasta(proximaFecha);
    
    let color, etiqueta;
    if(diasMin < 0){       color='#ef4444'; etiqueta=`<strong>ATRASADA</strong> ${Math.abs(diasMin)} días`; }
    else if(diasMin <= 3){ color='#f97316'; etiqueta=`Revisar en <strong>${diasMin}</strong> día(s)`; }
    else {                 color='#22c55e'; etiqueta=`Próxima en <strong>${diasMin}</strong> días`; }

    revHTML += `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-radius:6px; margin-bottom:8px; border-left:4px solid ${color}; background-color:${color}18;">
        <div>
          <strong style="display:block; font-size:1rem;">${escapeHtml(nombreCliente)}</strong>
          <small style="color:#6b7280; display:block; margin-top:2px;">🚪 ${lista.length} puerta(s): ${escapeHtml(resumenTipos)}</small>
          <small style="color:#6b7280; display:block; margin-top:2px;">📅 ${proximaFecha} — ${etiqueta}</small>
        </div>
        <button class="btn btn-primary btn-sm" onclick="gestionarPuertas('${clienteId}')">Ver</button>
      </div>`;
  });

  // ── Saludo dinámico ──
  const h = new Date().getHours();
  const saludo = h<12 ? 'Buenos días' : h<20 ? 'Buenas tardes' : 'Buenas noches';

  // ── Renderizado HTML: Dashboard ──
  el.innerHTML = `
    <div class="page-header"><div><h2>${saludo} 👋</h2><p>Resumen general · ${new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'})}</p></div></div>

    ${bannerHTML}

    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon" style="background:#dbeafe;color:#2563eb"><i class="fas fa-users"></i></div><div class="stat-info"><h3>${clientes.length}</h3><p>Clientes</p></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#dcfce7;color:#16a34a"><i class="fas fa-file-invoice-dollar"></i></div><div class="stat-info"><h3>${formatCurrency(totalPresupuesto)}</h3><p>Presupuestos</p></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#ffedd5;color:#ea580c"><i class="fas fa-clipboard-list"></i></div><div class="stat-info"><h3>${partesAbiertos}</h3><p>Partes abiertos</p></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#e0e7ff;color:#4f46e5"><i class="fas fa-circle-check"></i></div><div class="stat-info"><h3>${partesCompletados}</h3><p>Completados</p></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#fef3c7;color:#d97706"><i class="fas fa-truck"></i></div><div class="stat-info"><h3>${vehiculosEnRuta}</h3><p>Vehículos en ruta</p></div></div>
      <div class="stat-card" style="cursor:pointer${stockBajoItems.length?';border-left:4px solid #dc2626':''}" onclick="navigateTo('almacen')" title="Ver almacén"><div class="stat-icon" style="background:#fee2e2;color:#dc2626"><i class="fas fa-triangle-exclamation"></i></div><div class="stat-info"><h3>${stockBajoItems.length}</h3><p>Stock bajo</p></div></div>
    </div>

    ${numAlertas > 0 ? `
    <div class="card" style="margin-top:20px; grid-column: 1 / -1;">
      <div class="card-header">
        <h3><i class="fas fa-exclamation-triangle" style="color:#f59e0b; margin-right:8px;"></i>Alertas ITV (${numAlertas})</h3>
      </div>
      <div style="padding: 15px;">
        ${alertasHTML}
      </div>
    </div>
    ` : ''}
     ${numRev > 0 ? `
    <div class="card" style="margin-top:20px; grid-column: 1 / -1;">
      <div class="card-header">
        <h3><i class="fas fa-door-open" style="color:#3b82f6; margin-right:8px;"></i>Próximas revisiones (${numRev})</h3>
        <button class="btn btn-primary btn-sm" onclick="abrirRondaRevisiones()"><i class="fas fa-clipboard-check"></i> Ronda rápida</button>
      </div>
      <div style="padding: 15px;">
        ${revHTML}
      </div>
    </div>
    ` : ''}

    <div class="card" style="margin-top:20px; grid-column: 1 / -1;">
      <div class="card-header"><h3><i class="fas fa-chart-line" style="color:#3b82f6;margin-right:8px"></i>Actividad últimos 30 días</h3></div>
      <canvas id="dashChart" height="90"></canvas>
    </div>

    <div class="card" style="margin-top:20px; grid-column: 1 / -1;">
      <div class="card-header"><h3>Últimos presupuestos</h3><button class="btn btn-outline btn-sm" onclick="navigateTo('presupuestos')">Ver todos</button></div>
      <div class="table-wrapper"><table><thead><tr><th>ID</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Estado</th></tr></thead><tbody>
        ${presupuestos.slice(-5).reverse().map(p =>
          `<tr><td>${escapeHtml(p.id)}</td><td>${escapeHtml(p.clienteNombre)}</td><td>${formatDate(p.fecha)}</td><td>${formatCurrency(p.total)}</td>
          <td><span class="badge ${getBadgeClass(p.estado)}">${getStatusLabel(p.estado)}</span></td></tr>`
        ).join('') || '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted)">Sin presupuestos</td></tr>'}
      </tbody></table></div>
    </div>

    <div class="card" style="margin-top:20px; grid-column: 1 / -1;">
      <div class="card-header"><h3>Últimas tareas en curso</h3><button class="btn btn-outline btn-sm" onclick="navigateTo('partesTrabajo')">Ver todos</button></div>
      <div class="table-wrapper"><table><thead><tr><th>Parte</th><th>Cliente</th><th>Tipo</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>
        ${partes.filter(p => p.estado !== 'completado').slice(-5).reverse().map(p =>
          `<tr><td>${escapeHtml(p.id)}</td><td>${escapeHtml(p.clienteNombre)}</td><td>${escapeHtml(p.tipoPuerta)}</td>
          <td><span class="badge ${getBadgeClass(p.estado)}">${getStatusLabel(p.estado)}</span></td><td>${formatDate(p.fecha)}</td></tr>`
        ).join('') || '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted)">Sin tareas en curso</td></tr>'}
      </tbody></table></div>
    </div>

    <div id="dailyReportContainer" style="margin-top:20px; grid-column: 1 / -1;"></div>
  `;

  actualizarCuentaAtrasITV();

  // ── Gráfico actividad ──
  setTimeout(() => {
    try {
      const canvas = document.getElementById('dashChart');
      if(!canvas || !window.Chart) return;
      
      const prev = Chart.getChart('dashChart'); 
      if(prev) prev.destroy();

      const dias = [], counts = [];
      for(let i=29;i>=0;i--){
        const d = new Date(); d.setDate(d.getDate()-i);
        const iso = d.toISOString().substring(0,10);
        dias.push(d.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'}));
        counts.push(partes.filter(p=>p.fecha===iso).length);
      }

      new Chart(canvas,{
        type:'line',
        data:{ labels:dias, datasets:[{ label:'Partes', data:counts, borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,0.1)', fill:true, tension:0.35, pointRadius:2 }] },
        options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{stepSize:1}}} }
      });
    } catch(e){ console.warn('Error gráfico dashboard:', e); }
  }, 100);

  // ── Informe diario de flota ──
  render_daily_report('dailyReportContainer').catch(console.error);
};

// ═══════════════════════════════════════════════════════════
//  CLIENTES
// ═══════════════════════════════════════════════════════════
window.render_clientes = async function(el){
  el.innerHTML =
    '<div class="page-header"><div><h2>Clientes</h2><p>Gestión de clientes</p></div>'+
    '<div class="header-actions"><button class="btn btn-primary" onclick="showClienteForm()"><i class="fas fa-plus"></i> Nuevo Cliente</button></div></div>'+
    '<div class="search-bar">'+
      '<input type="text" placeholder="Buscar cliente..." id="searchCliente" oninput="renderClientes()">'+
      '<select id="filterTipo" onchange="renderClientes()"><option value="">Todos</option><option value="empresa">Empresa</option><option value="particular">Particular</option></select></div>'+
    '<div class="card"><div  class="table-wrapper"><table><thead>'+
      '<tr><th>ID</th><th>Nombre</th><th>Contacto</th><th>Teléfono</th><th>Email</th><th>Tipo</th><th>Acciones</th></tr>'+
    '</thead><tbody id="clientesBody"></tbody></table></div></div>';
  renderClientes();
};

window.renderClientes = async function(){
  const clientes = await dbGetAll('clientes');
  const q = (document.getElementById('searchCliente')?.value||'').toLowerCase();
  const tipo = document.getElementById('filterTipo')?.value||'';
  const filtered = clientes.filter(c=>{
    if(q && !JSON.stringify(c).toLowerCase().includes(q)) return false;
    if(tipo && c.tipo!==tipo) return false;
    return true;
  });
  document.getElementById('clientesBody').innerHTML = filtered.map(c=>
    '<tr><td>'+escapeHtml(c.id)+'</td><td><strong>'+escapeHtml(c.nombre)+'</strong></td><td>'+escapeHtml(c.contacto)+'</td>'+
    '<td>'+escapeHtml(c.telefono)+'</td><td>'+escapeHtml(c.email)+'</td>'+
    '<td><span class="badge '+(c.tipo==='empresa'?'badge-blue':'badge-gray')+'">'+(c.tipo==='empresa'?'Empresa':'Particular')+'</span></td>'+
    '<td class="actions-cell">'+
      '<button class="btn btn-outline btn-sm btn-icon" title="Ubicaciones" onclick="gestionarUbicaciones(\''+c.id+'\')"><i class="fas fa-map-marker-alt"></i></button>'+
      '<button class="btn btn-outline btn-sm btn-icon" title="Puertas" onclick="gestionarPuertas(\''+c.id+'\')"><i class="fas fa-door-open"></i></button>'+
      '<button class="btn btn-outline btn-sm btn-icon" title="Histórico revisiones" onclick="verHistoricoPuertas(\''+c.id+'\')"><i class="fas fa-clock-rotate-left"></i></button>'+
      '<button class="btn btn-outline btn-sm btn-icon" title="Editar" data-action="edit-cliente" data-id="'+escapeHtml(c.id)+'"><i class="fas fa-pen"></i></button>'+
      '<button class="btn btn-outline btn-sm btn-icon" title="PDF" onclick="generatePDF_clientes(\''+c.id+'\')"><i class="fas fa-file-pdf"></i></button>'+
      '<button class="btn btn-outline btn-sm btn-icon" title="Eliminar" onclick="confirmDelete(\'Cliente '+escapeHtml(c.nombre)+'\', ()=>deleteCliente(\''+c.id+'\'))"><i class="fas fa-trash"></i></button>'+
    '</td>'
  ).join('') || '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted)">Sin clientes</td></tr>';
};
async function showClienteForm(editId = null, opts = {}) {
  const id = editId ? String(editId) : null;
  const c = id ? (await dbGet('clientes', id)) || {} : {};

  // Solo cadenas padre para el selector "Pertenece a"
  const allClientes = await dbGetAll('clientes');
  const cadenasPadre = allClientes.filter(x => x.esCadena);
  const nextId = c.id || window.db.nextId('CLI');

  // Cadenas de mantenimiento (store 'cadenas') + sus rutas
  const cadenasMant = await getAllCadenas();
  let rutasCache = [];
  if (c.cadenaId) {
    try { rutasCache = await getRutasByCadena(c.cadenaId); } catch(e){ rutasCache = []; }
  }

  const opcionesCadenaMant = '<option value="">— Sin cadena —</option>' +
    cadenasMant.map(cm => `<option value="${cm.id}" ${c.cadenaId===cm.id?'selected':''}>${escapeHtml(cm.nombre)}</option>`).join('');

  const opcionesRuta = '<option value="">— Sin ruta —</option>' +
    rutasCache.map(r => `<option value="${r.id}" ${c.rutaId===r.id?'selected':''}>${escapeHtml(r.nombre)}</option>`).join('');

  const opcionesPadre = '<option value="">— Ninguno (cliente suelto) —</option>' +
    cadenasPadre.map(p => `<option value="${p.id}" ${c.padreId===p.id?'selected':''}>${escapeHtml(p.nombre)}</option>`).join('');

  const esCadenaChecked = (opts?.nuevoPadre === true || c.esCadena) ? 'checked' : '';

  const form = '<div class="form-grid">'+
    '<div class="form-group"><label>ID</label><input id="cf_id" value="'+escapeHtml(nextId)+'"></div>'+
    '<div class="form-group"><label>Tipo</label><select id="cf_tipo"><option value="empresa" '+(c.tipo==='empresa'?'selected':'')+'>Empresa</option><option value="particular" '+(c.tipo==='particular'?'selected':'')+'>Particular</option></select></div>'+
    '<div class="form-group full"><label><input type="checkbox" id="cf_escadena" '+esCadenaChecked+'> Es empresa / cadena principal (agrupa sucursales)</label></div>'+
    '<div class="form-group"><label>Pertenece a (cadena principal)</label>'+
      '<select id="cf_padre">'+opcionesPadre+'</select>'+
      '<div style="margin-top:6px;font-size:12px;">'+
        '<a href="#" onclick="event.preventDefault(); document.getElementById(\'cf_escadena\').checked=true; document.getElementById(\'cf_nombre\').focus(); return false;" style="color:var(--primary);text-decoration:none;">+ Marcar como empresa/cadena principal</a>'+
      '</div>'+
    '</div>'+
    '<div class="form-group"><label>Nombre / Razón social *</label><input id="cf_nombre" value="'+escapeHtml(c.nombre||'')+'" required></div>'+
    '<div class="form-group"><label>Cadena de mantenimiento</label><select id="cf_cadena">'+opcionesCadenaMant+'</select></div>'+
    '<div class="form-group"><label>Ruta</label><select id="cf_ruta">'+opcionesRuta+'</select></div>'+
    '<div class="form-group"><label>Persona de contacto</label><input id="cf_contacto" value="'+escapeHtml(c.contacto||'')+'"></div>'+
    '<div class="form-group"><label>Email</label><input id="cf_email" type="email" value="'+escapeHtml(c.email||'')+'"></div>'+
    '<div class="form-group"><label>Teléfono</label><input id="cf_telefono" class="only-num" value="'+(c.telefono ? c.telefono.replace(/\D/g,'') : '')+'"></div>'+
    '<div class="form-group"><label>Dirección</label>'+
      '<div style="display:flex;gap:6px">'+
        '<input id="cf_direccion" value="'+escapeHtml(c.direccion||'')+'" style="flex:1">'+
        '<button type="button" class="btn btn-outline btn-sm" onclick="geolocalizarCliente()" title="Buscar coordenadas">'+
          '<i class="fas fa-map-marker-alt"></i></button>'+
      '</div>'+
      '<small id="cf_geo_estado" style="color:var(--text-muted);font-size:11px">'+
        (c.lat ? '✅ '+c.lat.toFixed(4)+', '+c.lng.toFixed(4) : '⚠️ Sin coordenadas (pulsa el mapa)')+
      '</small>'+
    '</div>'+
    '<div class="form-group full"><label>Notas</label><textarea id="cf_nota">'+escapeHtml(c.nota||'')+'</textarea></div>'+
  '</div>';

  const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary btn-save-cliente" data-action="save-cliente" data-id="'+(id ? escapeHtml(id) : '')+'"><i class="fas fa-save"></i> Guardar</button>';

  openModal(id?'Editar Cliente':'Nuevo Cliente',form,footer);

  // Al cambiar la cadena de mantenimiento, recargar rutas
  document.getElementById('cf_cadena').addEventListener('change', async (e) => {
    const sel = document.getElementById('cf_ruta');
    const cid = e.target.value;
    sel.innerHTML = '<option value="">— Sin ruta —</option>';
    if (!cid) return;
    const rutas = await getRutasByCadena(cid);
    sel.innerHTML += rutas.map(r => `<option value="${r.id}">${escapeHtml(r.nombre)}</option>`).join('');
  });
}

window.saveCliente = async function(id){
  id = id ? String(id) : null;
  try {
    const existing = id ? await dbGet('clientes', id) : null;
    const data = {
      id: document.getElementById('cf_id').value.trim(),
      tipo: document.getElementById('cf_tipo').value,
      nombre: document.getElementById('cf_nombre').value.trim(),
      contacto: document.getElementById('cf_contacto').value.trim(),
      email: document.getElementById('cf_email').value.trim(),
      telefono: document.getElementById('cf_telefono').value.trim(),
      direccion: document.getElementById('cf_direccion').value.trim(),
      lat: window.__geoCliente?.lat || existing?.lat || null,
      lng: window.__geoCliente?.lng || existing?.lng || null,
      nota: document.getElementById('cf_nota').value.trim(),
      esCadena: document.getElementById('cf_escadena')?.checked || false,
      padreId: document.getElementById('cf_padre')?.value || null,
      cadenaId: document.getElementById('cf_cadena')?.value || null,
      rutaId:   document.getElementById('cf_ruta')?.value || null,
    };

    // ── Validación en línea ──
    let ok = true;
    ok &= setFieldError('cf_nombre',   validators.required(data.nombre, 'El nombre'));
    ok &= setFieldError('cf_email',    validators.email(data.email));
    ok &= setFieldError('cf_telefono', validators.telefono9(data.telefono));

    if(!ok){ showToast('Revisa los campos marcados','error'); return; }

    await dbPut('clientes', data);
    closeModal();
    window.__geoCliente = null;
    showToast('Cliente guardado');
    navigateTo('clientes');
  } catch(err){
    console.error('Error al guardar cliente:', err);
    showToast('Error al guardar: '+err.message,'error');
  }
};
window.geolocalizarCliente = async function(){
  const dir = document.getElementById('cf_direccion').value.trim();
  if(!dir){ showToast('Escribe una dirección primero','error'); return; }
  const estado = document.getElementById('cf_geo_estado');
  estado.textContent = '🔍 Buscando...';
  const geo = await geocodificar(dir);
  if(!geo){
    estado.textContent = '❌ No encontrada. Revisa la dirección.';
    showToast('Dirección no encontrada','error');
    return;
  }
  window.__geoCliente = geo;
  estado.textContent = '✅ ' + geo.nombreCompleto.split(',').slice(0,3).join(',');
  showToast('Coordenadas encontradas');
};

window.deleteCliente = async function(id){
  await dbDelete('clientes',id);
  showToast('Cliente eliminado');navigateTo('clientes');
};
// ═══════════════════════════════════════════════════════════
//  PRESUPUESTOS
// ═══════════════════════════════════════════════════════════
window.render_presupuestos = async function(el){
  el.innerHTML =
    '<div class="page-header"><div><h2>Presupuestos</h2><p>Genera y gestiona presupuestos</p></div>'+
    '<div class="header-actions">'+
      '<button class="btn btn-primary" onclick="showPresupuestoForm()"><i class="fas fa-plus"></i> Nuevo Presupuesto</button>'+
      '<button class="btn btn-outline" onclick="showPlantillasPresupuesto()"><i class="fas fa-bookmark"></i> Plantillas</button>'+
      '<button class="btn btn-outline" onclick="generatePDF_presupuestos()"><i class="fas fa-file-pdf"></i> Exportar todo</button></div></div>'+
    '<div class="search-bar"><input type="text" placeholder="Buscar..." id="searchPres" oninput="renderPresupuestos()"></div>'+
    '<div class="card"><div  class="table-wrapper"><table><thead>'+
      '<tr><th>ID</th><th>Cliente</th><th>Fecha</th><th>Válido hasta</th><th>Total</th><th>Estado</th><th>Acciones</th></tr>'+
    '</thead><tbody id="presBody"></tbody></table></div></div>';
  renderPresupuestos();
};

window.renderPresupuestos = async function(){
  const presupuestos = await dbGetAll('presupuestos');
  const q = (document.getElementById('searchPres')?.value||'').toLowerCase();
  const filtered = presupuestos.filter(p=>JSON.stringify(p).toLowerCase().includes(q));
  document.getElementById('presBody').innerHTML = filtered.map(p=>
    '<tr><td><strong>'+escapeHtml(p.id)+'</strong></td><td>'+escapeHtml(p.clienteNombre)+'</td>'+
    '<td>'+formatDate(p.fecha)+'</td><td>'+formatDate(p.validoHasta)+'</td>'+
    '<td>'+formatCurrency(p.total)+'</td>'+
    '<td><span class="badge '+getBadgeClass(p.estado)+'">'+getStatusLabel(p.estado)+'</span></td>'+
    '<td class="actions-cell">'+
      '<button class="btn btn-outline btn-sm btn-icon" title="Editar" data-action="edit-presupuesto" data-id="'+escapeHtml(p.id)+'"><i class="fas fa-pen"></i></button>'+
      '<button class="btn btn-outline btn-sm btn-icon" title="Enviar al cliente" onclick="sendPresupuesto(\''+p.id+'\')"><i class="fas fa-paper-plane"></i></button>'+
      '<button class="btn btn-outline btn-sm btn-icon" title="PDF" onclick="generatePDF_presupuesto(\''+p.id+'\')"><i class="fas fa-file-pdf"></i></button>'+
      '<button class="btn btn-outline btn-sm btn-icon" title="Guardar como plantilla" onclick="savePresupuestoAsTemplate(\''+p.id+'\')"><i class="fas fa-bookmark"></i></button>'+
      '<button class="btn btn-outline btn-sm btn-icon" title="Duplicar" onclick="duplicatePresupuesto(\''+p.id+'\')"><i class="fas fa-copy"></i></button>'+
      '<button class="btn btn-outline btn-sm btn-icon" title="Eliminar" onclick="confirmDelete(\'Presupuesto '+escapeHtml(p.id)+'\', ()=>deletePresupuesto(\''+p.id+'\'))"><i class="fas fa-trash"></i></button>'+
    '</td></tr>'
  ).join('') || '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">Sin presupuestos</td></tr>';
};

// ── Líneas de concepto ─────────────────────────────────────
window.__lineItems = {};

function renderLineItems(cid, items){
  const containerId = cid.endsWith('_items') ? cid : cid + '_items';
  const container = document.getElementById(containerId);
  if(!container) return;
  container.innerHTML = items.map((item,i)=>
    '<tr data-idx="'+i+'">'+
      '<td><input type="text" data-field="descripcion" value="'+escapeHtml(item.descripcion)+'" onchange="updateLineItem(\''+cid+'\','+i+',\'descripcion\',this.value)" style="min-width:200px"></td>'+
      '<td><select data-field="tipoId" onchange="updateLineItem(\''+cid+'\','+i+',\'tipoId\',this.value)">'+
        (window.__tipos||[]).map(t=>'<option value="'+t.id+'" '+(item.tipoId===t.id?'selected':'')+'>'+escapeHtml(t.nombre)+'</option>').join('')+'</td>'+
      '<td><input type="number" data-field="cantidad" class="only-num-dec" min="0" step="0.01" inputmode="decimal" value="'+(Number(item.cantidad)||0)+'" onchange="updateLineItem(\''+cid+'\','+i+',\'cantidad\',this.value)" style="width:110px"></td>'+
      '<td><input type="number" data-field="precio" class="only-num-dec" min="0" step="0.01" inputmode="decimal" value="'+(Number(item.precio)||0)+'" onchange="updateLineItem(\''+cid+'\','+i+',\'precio\',this.value)" style="width:110px"></td>'+
      '<td><strong>'+formatCurrency(item.cantidad*item.precio)+'</strong></td>'+
      '<td><button class="btn btn-outline btn-sm btn-icon" onclick="removeLineItem(\''+cid+'\','+i+')"><i class="fas fa-minus"></i></button></td>'+
    '</tr>'
  ).join('');
}

window.updateLineItem = function(cid,idx,field,val){
  if(!window.__lineItems[cid]) return;
  window.__lineItems[cid][idx][field] = (field==='cantidad'||field==='precio') ? parseFloat(val)||0 : val;
};

window.removeLineItem = function(cid,idx){
  if(!window.__lineItems[cid]) return;
  window.__lineItems[cid].splice(parseInt(idx),1);
  renderLineItems(cid, window.__lineItems[cid]);
};

window.addLineItem = function(cid){
  const key = cid.endsWith('_items') ? cid.replace(/_items$/, '') : cid;
  if(!window.__lineItems[key]) window.__lineItems[key]=[];
  window.__lineItems[key].push({descripcion:'',tipoId:'',cantidad:1,precio:0});
  renderLineItems(key, window.__lineItems[key]);
};
function calcTotals(prefix){
  const rows = document.querySelectorAll('#'+prefix+'_items tr');
  let sub = 0;
  rows.forEach(r=>{
    const cant = parseFloat(r.querySelector('[data-field="cantidad"]')?.value)||0;
    const precio = parseFloat(r.querySelector('[data-field="precio"]')?.value)||0;
    sub += cant*precio;
  });
  const iva = sub*0.21;
  const el = document.getElementById(prefix+'_totals');
  if(el){
    el.querySelector('#'+prefix+'_subtotal')?.textContent && (el.querySelector('#'+prefix+'_subtotal').textContent = formatCurrency(sub));
    el.querySelector('#'+prefix+'_iva')?.textContent && (el.querySelector('#'+prefix+'_iva').textContent = formatCurrency(iva));
    el.querySelector('#'+prefix+'_total')?.textContent && (el.querySelector('#'+prefix+'_total').textContent = formatCurrency(sub+iva));
  }
}

window.showPresupuestoForm = async function(id, tpl){
  id = id ? String(id) : null;
  await dbGetAll('tiposPuerta').then(r=>{window.__tipos=r});
  window.__lineItems = {};
  const p = id ? await dbGet('presupuestos',id)
    : (tpl ? {notas:tpl.notas||'', lineItems:JSON.parse(JSON.stringify(tpl.lineItems||[]))} : {});
  const items = p.lineItems || [{descripcion:'',tipoId:'',cantidad:1,precio:0}];
  const lid = id ? 'pf_edit' : 'pf_new';
  window.__lineItems[lid] = items;

  const nextId = p.id || window.db.nextId('PRES');

  const clientes = await dbGetAll('clientes');
  const form = '<div class="form-grid">'+
    '<div class="form-group"><label>ID</label><input id="pf_id" value="'+escapeHtml(nextId)+'"></div>'+
    '<div class="form-group"><label>Cliente *</label><select id="pf_cliente">'+
      '<option value="">— Seleccionar —</option>'+
      clientes.map(c=>'<option value="'+c.id+'" data-nombre="'+escapeHtml(c.nombre)+'" '+(p.clienteId===c.id?'selected':'')+'>'+escapeHtml(c.nombre)+'</option>').join('')+'</select></div>'+
    '<div class="form-group"><label>Fecha</label><input id="pf_fecha" type="date" value="'+(p.fecha||getToday())+'"></div>'+
    '<div class="form-group"><label>Válido hasta</label><input id="pf_valido" type="date" value="'+(p.validoHasta||'')+'"></div>'+
    '<div class="form-group"><label>Estado</label><select id="pf_estado">'+
      ['borrador','enviado','aprobado','rechazado'].map(e=>'<option value="'+e+'" '+(p.estado===e?'selected':'')+'>'+getStatusLabel(e)+'</option>').join('')+'</select></div>'+
    '<div class="form-group full"><label>Notas</label><textarea id="pf_notas">'+escapeHtml(p.notas||'')+'</textarea></div>'+
  '</div>'+
  '<h3 style="margin:20px 0 10px">Conceptos</h3>'+
  '<div  class="table-wrapper"><table><thead><tr><th>Descripción</th><th>Tipo</th><th>Cant.</th><th>Precio</th><th>Subtotal</th><th></th></tr></thead><tbody id="'+lid+'_items"></tbody></table></div>'+
  '<button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="addLineItem(\''+lid+'\')"><i class="fas fa-plus"></i> Añadir línea</button>'+
  '<div class="totals-box" id="'+lid+'_totals">'+
    '<div class="row"><span>Subtotal:</span><span id="'+lid+'_subtotal">0,00 €</span></div>'+
    '<div class="row"><span>IVA (21%):</span><span id="'+lid+'_iva">0,00 €</span></div>'+
    '<div class="row grand"><span>TOTAL:</span><span id="'+lid+'_total">0,00 €</span></div>'+
  '</div>';

  const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary btn-save-presupuesto" data-action="save-presupuesto" data-id="'+(id ? escapeHtml(id) : '')+'"><i class="fas fa-save"></i> Guardar</button>';
  openModal(id?'Editar Presupuesto':'Nuevo Presupuesto',form,footer);

  renderLineItems(lid, items);
  setTimeout(()=>{
    const tbody = document.getElementById(lid + '_items');
    if (tbody) tbody.addEventListener('input',()=>calcTotals(lid));
    calcTotals(lid);
  },100);
};

window.savePresupuesto = async function(id){
  id = id ? String(id) : null;
  try {
    const sel = document.getElementById('pf_cliente');
    const clienteId = sel.value;
    const clienteNombre = sel.options[sel.selectedIndex]?.dataset.nombre||'';
    const lid = id ? 'pf_edit' : 'pf_new';
    const items = [];
    document.querySelectorAll('#'+lid+'_items tr').forEach(r=>{
      items.push({
        descripcion: r.querySelector('[data-field="descripcion"]')?.value||'',
        tipoId: r.querySelector('[data-field="tipoId"]')?.value||'',
        cantidad: parseFloat(r.querySelector('[data-field="cantidad"]')?.value)||0,
        precio: parseFloat(r.querySelector('[data-field="precio"]')?.value)||0
      });
    });

    // ── Validación en línea ──
    let ok = true;

    // Cliente obligatorio
    if(!clienteId){
      setFieldError('pf_cliente', 'Selecciona un cliente');
      ok = false;
    } else {
      clearFieldError('pf_cliente');
    }

    // Fecha obligatoria
    const fecha = document.getElementById('pf_fecha').value;
    ok &= setFieldError('pf_fecha', validators.required(fecha, 'La fecha'));

    // Válido hasta no anterior a la fecha
    const valido = document.getElementById('pf_valido').value;
    if(valido && fecha && valido < fecha){
      setFieldError('pf_valido', 'La validez no puede ser anterior a la fecha');
      ok = false;
    } else {
      clearFieldError('pf_valido');
    }

    // Al menos una línea con descripción
    const lineTbody = document.getElementById(lid+'_items');
    const hasValidLine = items.some(i => i.descripcion.trim());
    if(!hasValidLine){
      showToast('Añade al menos un concepto con descripción','error');
      if(lineTbody) lineTbody.style.outline = '2px solid #dc2626';
      ok = false;
    } else if(lineTbody){
      lineTbody.style.outline = '';
    }

    if(!ok){ showToast('Revisa los campos marcados','error'); return; }

    const sub = items.reduce((s,i)=>s+i.cantidad*i.precio,0);
    const data = {
      id: document.getElementById('pf_id').value.trim(),
      clienteId, clienteNombre,
      fecha,
      validoHasta: valido,
      estado: document.getElementById('pf_estado').value,
      notas: document.getElementById('pf_notas').value.trim(),
      lineItems: items,
      subtotal: sub,
      iva: sub*0.21,
      total: sub*1.21
    };

    await dbPut('presupuestos', data);
    closeModal();
    showToast('Presupuesto guardado');
    navigateTo('presupuestos');
  } catch(err){
    console.error('Error al guardar presupuesto:', err);
    showToast('Error al guardar: '+err.message,'error');
  }
};

window.duplicatePresupuesto = async function(id){
  const orig = await dbGet('presupuestos',id);
  if(!orig) return;
  const dup = {...orig, id:'PRES-'+uid().slice(0,4).toUpperCase(), fecha:getToday(), estado:'borrador'};
  await dbAdd('presupuestos',dup);
  showToast('Presupuesto duplicado');navigateTo('presupuestos');
};

window.deletePresupuesto = async function(id){
  await dbDelete('presupuestos',id);
  showToast('Presupuesto eliminado');navigateTo('presupuestos');
};

// ── Plantillas de presupuesto (guardadas en este dispositivo) ──
const PLANTILLAS_KEY = 'valgom_plantillas_presupuesto';
function getPlantillasPresupuesto(){
  try { return JSON.parse(localStorage.getItem(PLANTILLAS_KEY)) || []; } catch(e){ return []; }
}
function setPlantillasPresupuesto(list){ localStorage.setItem(PLANTILLAS_KEY, JSON.stringify(list)); }

window.savePresupuestoAsTemplate = async function(id){
  const p = await dbGet('presupuestos',id);
  if(!p) return;
  const nombre = (prompt('Nombre de la plantilla:', 'Plantilla de '+(p.clienteNombre||p.id))||'').trim();
  if(!nombre) return;
  const list = getPlantillasPresupuesto();
  list.push({id:uid(), nombre, notas:p.notas||'', lineItems:p.lineItems||[]});
  setPlantillasPresupuesto(list);
  showToast('Plantilla guardada');
};

window.showPlantillasPresupuesto = function(){
  const list = getPlantillasPresupuesto();
  const body = list.length
    ? '<div style="display:flex;flex-direction:column;gap:8px">'+list.map(t=>
        '<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;padding:10px;border:1px solid var(--border,#e5e7eb);border-radius:8px">'+
        '<div><strong>'+escapeHtml(t.nombre)+'</strong><div style="font-size:12px;color:var(--text-muted)">'+(t.lineItems||[]).length+' conceptos</div></div>'+
        '<div style="display:flex;gap:6px"><button class="btn btn-primary btn-sm" onclick="usarPlantillaPresupuesto(\''+escapeHtml(t.id)+'\')">Usar</button>'+
        '<button class="btn btn-outline btn-sm btn-icon" title="Eliminar" onclick="borrarPlantillaPresupuesto(\''+escapeHtml(t.id)+'\')"><i class="fas fa-trash"></i></button></div></div>'
      ).join('')+'</div>'
    : '<p style="color:var(--text-muted)">Aún no hay plantillas. Usa el icono de marcador en un presupuesto para guardarlo como plantilla.</p>';
  openModal('Plantillas de presupuesto', body, '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
};

window.usarPlantillaPresupuesto = function(tid){
  const t = getPlantillasPresupuesto().find(x=>x.id===tid);
  if(!t) return;
  closeModal();
  showPresupuestoForm(null, t);
};

window.borrarPlantillaPresupuesto = function(tid){
  setPlantillasPresupuesto(getPlantillasPresupuesto().filter(x=>x.id!==tid));
  showPlantillasPresupuesto();
};

// ── Enviar presupuesto por email / compartir ──
window.sendPresupuesto = async function(id){
  const p = await dbGet('presupuestos',id);
  if(!p){ showToast('Presupuesto no encontrado','error'); return; }
  const cliente = p.clienteId ? await dbGet('clientes',p.clienteId) : null;
  const email = (cliente && cliente.email) || '';
  const asunto = 'Presupuesto '+p.id+' — Valgom';
  const texto = 'Hola'+(p.clienteNombre?' '+p.clienteNombre:'')+',\n\nTe adjuntamos el presupuesto '+p.id+' por un total de '+formatCurrency(p.total)+' (IVA incluido).\n\nQuedamos a tu disposición para cualquier duda.\n\nUn saludo,\nValgom';
  let enviado = false;
  try {
    const file = await window.generatePDF_presupuesto(id, {asFile:true});
    if(file && navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title:asunto, text:texto});
      enviado = true;
    } else if(file){
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 5000);
      window.location.href = 'mailto:'+encodeURIComponent(email)+'?subject='+encodeURIComponent(asunto)+'&body='+encodeURIComponent(texto+'\n\n(Adjunta el PDF descargado: '+file.name+')');
      showToast('PDF descargado: adjúntalo al correo que se ha abierto');
      enviado = true;
    }
  } catch(err){
    if(err && err.name === 'AbortError') return;
    console.error(err);
    showToast('No se pudo enviar: '+err.message,'error');
    return;
  }
  if(enviado && p.estado === 'borrador'){
    await dbPut('presupuestos', {...p, estado:'enviado'});
    renderPresupuestos();
  }
};

// ═══════════════════════════════════════════════════════════
//  PARTES DE TRABAJO (CON CAMPO HORAS)
// ═══════════════════════════════════════════════════════════
window.render_partesTrabajo = async function(el){
  el.innerHTML =
    '<div class="page-header"><div><h2>Partes de Trabajo</h2><p>Seguimiento de instalaciones y reparaciones</p></div>'+
    '<div class="header-actions"><button class="btn btn-primary" onclick="showParteForm()"><i class="fas fa-plus"></i> Nuevo Parte</button></div></div>'+
    '<div class="search-bar">'+
      '<input type="text" placeholder="Buscar..." id="searchParte" oninput="renderPartes()">'+
      '<select id="filterEstadoParte" onchange="renderPartes()"><option value="">Todos</option>'+
        '<option value="abierto">Abierto</option><option value="en_ruta">En ruta</option>'+
        '<option value="en_taller">En taller</option><option value="completado">Completado</option></select>'+
      '<select id="filterClienteParte" onchange="renderPartes()"><option value="">Todos los clientes</option></select>'+
      '<input type="date" id="filterFechaDesde" onchange="renderPartes()" title="Desde">'+
      '<input type="date" id="filterFechaHasta" onchange="renderPartes()" title="Hasta">'+
    '</div>'+
    '<div class="card"><div  class="table-wrapper"><table><thead>'+
            '<tr><th>ID</th><th>Cliente</th><th>Ubicación</th><th>Puertas</th><th>Técnico</th><th>Tipo Puerta</th><th>Kms</th><th>Horas</th><th>Fotos</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr>'+
    '</thead><tbody id="parteBody"></tbody></table></div></div>';

  // Rellenar desplegable de clientes
  const clientes = await dbGetAll('clientes');
  const selCli = document.getElementById('filterClienteParte');
  selCli.innerHTML = '<option value="">Todos los clientes</option>' +
    clientes.sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''))
      .map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.nombre)+'</option>').join('');

  renderPartes();
};

window.renderPartes = async function(){
  const partes = await dbGetAll('partesTrabajo');
  const puertas = await dbGetAll('puertas');
  const mapPuertas = Object.fromEntries(puertas.map(p => [p.id, p.nombre]));

  const q = (document.getElementById('searchParte')?.value||'').toLowerCase();
  const estado = document.getElementById('filterEstadoParte')?.value||'';
  const clienteId = document.getElementById('filterClienteParte')?.value||'';
  const desde = document.getElementById('filterFechaDesde')?.value||'';
  const hasta = document.getElementById('filterFechaHasta')?.value||'';

  const filtered = partes.filter(p=>{
    if(q && !JSON.stringify(p).toLowerCase().includes(q)) return false;
    if(estado && p.estado!==estado) return false;
    if(clienteId && p.clienteId!==clienteId) return false;
    if(desde && p.fecha < desde) return false;
    if(hasta && p.fecha > hasta) return false;
    return true;
  });

  document.getElementById('parteBody').innerHTML = filtered.map(p=>
    '<tr><td><strong>'+escapeHtml(p.id)+'</strong></td><td>'+escapeHtml(p.clienteNombre)+'</td>'+
    '<td>'+(p.ubicacionNombre ? escapeHtml(p.ubicacionNombre)+'<br><small style="color:#666">'+escapeHtml(p.ubicacionDireccion||'')+'</small>' : '—')+'</td>'+
    '<td>' + ((p.puertaIds && p.puertaIds.length)
      ? p.puertaIds.map(id => '<span class="badge badge-blue" style="margin:1px">' + escapeHtml(mapPuertas[id] || id) + '</span>').join('')
      : '—') + '</td>' +
    '<td>'+(p.empleadoNombre ? escapeHtml(p.empleadoNombre) : '—')+'</td>'+
    '<td><span class="badge badge-blue">'+escapeHtml(p.tipoPuerta)+'</span></td>'+
    '<td>'+(p.kms||0)+' km</td>'+
    '<td>'+(p.horas ? p.horas+' h' : '—')+'</td>'+
    '<td>' + (p.fotos?.length
  ? p.fotos.map(f =>
      '<a href="'+f+'" target="_blank" title="Ver foto">' +
        '<img src="'+f+'" style="width:42px;height:42px;object-fit:cover;' +
        'border-radius:6px;margin-right:4px;border:1px solid var(--border);vertical-align:middle">' +
      '</a>').join('')
  : '—') + '</td>' +
    '<td><span class="badge '+getBadgeClass(p.estado)+'">'+getStatusLabel(p.estado)+'</span></td>'+
    '<td>'+formatDate(p.fecha)+'</td>'+
    '<td class="actions-cell">'+
      '<button class="btn btn-outline btn-sm btn-icon" title="Editar" data-action="edit-parte" data-id="'+escapeHtml(p.id)+'"><i class="fas fa-pen"></i></button>'+
      '<button class="btn btn-outline btn-sm btn-icon" title="PDF" onclick="generatePDF_partes(\''+p.id+'\')"><i class="fas fa-file-pdf"></i></button>'+
      '<button class="btn btn-outline btn-sm btn-icon" title="Eliminar" onclick="confirmDelete(\'Parte '+escapeHtml(p.id)+'\', ()=>deleteParte('+p.id+'))"><i class="fas fa-trash"></i></button>'+
    '</td></tr>'
  ).join('') || '<tr><td colspan="12" style="text-align:center;padding:30px;color:var(--text-muted)">Sin partes de trabajo</td></tr>';
};
window.showParteForm = async function(id, prefill) {
  id = id ? String(id) : null;
  const p = id ? await dbGet('partesTrabajo', id) : (prefill || {});
  const clientes = await dbGetAll('clientes');
  const vehiculos = await dbGetAll('vehiculos');
  const empleados = window.isTechnician?.()
    ? (window.authState.employee ? [window.authState.employee] : [])
    : await dbGetAll('empleados');
  const all = await dbGetAll('partesTrabajo');
  const nextId = p.id || 'PT-' + String(all.length + 1).padStart(3, '0');

  const clienteSeleccionado = clientes.find(c => c.id === p.clienteId);
  const clienteDni = clienteSeleccionado?.dni || '';

  // Matrícula preseleccionada: directa (p.matricula) o vía vehiculoId
  let matriculaSel = p.matricula || '';
  if (!matriculaSel && p.vehiculoId) {
    matriculaSel = vehiculos.find(v => v.id === p.vehiculoId)?.matricula || '';
  }

  const form = '<div class="form-grid">' +
    '<div class="form-group"><label>ID</label><input id="pt_id" value="' + escapeHtml(nextId) + '"></div>' +
    '<div class="form-group"><label>Cliente *</label><select id="pt_cliente">' +
      '<option value="">— Seleccionar —</option>' +
      clientes.map(c => '<option value="' + c.id + '" data-nombre="' + escapeHtml(c.nombre) + '" ' + (p.clienteId === c.id ? 'selected' : '') + '>' + escapeHtml(c.nombre) + '</option>').join('') +
    '</select></div>' +
    '<div class="form-group"><label>Ubicación del trabajo</label><select id="pt_ubicacion"><option value="">-- Selecciona un cliente primero --</option></select></div>' +
    '<div class="form-group full"><label>🚪 Puertas a revisar</label>' +
      '<select id="pt_puertas" multiple style="height:140px">' +
        '<option value="">-- Selecciona un cliente primero --</option>' +
      '</select>' +
      '<small style="color:var(--text-muted);display:block;margin-top:4px">Ctrl+Clic para seleccionar varias</small>' +
    '</div>' +
    '<div class="form-group"><label>Técnico asignado</label><select id="pt_empleado">' +
      '<option value="">— Sin asignar —</option>' +
      empleados.map(e => '<option value="' + e.id + '" data-nombre="' + escapeHtml(e.nombre) + '" ' + (p.empleadoId === e.id ? 'selected' : '') + '>' + escapeHtml(e.nombre) + '</option>').join('') +
    '</select></div>' +
    '<div class="form-group"><label>Tipo Puerta *</label><input id="pt_tipo" value="' + escapeHtml(p.tipoPuerta || '') + '" placeholder="Ej: seccional, corredera..."></div>' +
    '<div class="form-group full"><label>Descripción del trabajo *</label><textarea id="pt_desc" rows="3">' + escapeHtml(p.descripcion || '') + '</textarea></div>' +
    '<div class="form-group"><label>Kms (Ceuti ↔ Cliente)</label>' +
      '<input id="pt_kms" class="only-num" value="' + (p.kms || '') + '" placeholder="Se calcula al elegir cliente">' +
    '</div>' +
    '<div class="form-group"><label>Horas</label><input id="pt_horas" type="number" step="0.5" class="only-num-dec" value="' + (p.horas || '') + '" placeholder="Ej: 1.5"></div>' +
    '<div class="form-group"><label>Vehículo *</label><select id="pt_vehiculo"><option value="">— Seleccionar vehículo —</option>' +
        vehiculos.map(v => '<option value="' + escapeHtml(v.matricula) + '" ' + (matriculaSel === v.matricula ? 'selected' : '') + '>' + escapeHtml(v.matricula) + ' - ' + escapeHtml(v.marca) + ' ' + escapeHtml(v.modelo) + '</option>').join('') +
    '</select></div>' +
    '<div class="form-group"><label>Estado</label><select id="pt_estado">' +
      ['abierto', 'en_ruta', 'en_taller', 'completado'].map(e => '<option value="' + e + '" ' + (p.estado === e ? 'selected' : '') + '>' + getStatusLabel(e) + '</option>').join('') +
    '</select></div>' +
    '<div class="form-group"><label>Fecha</label><input id="pt_fecha" type="date" value="' + (p.fecha || getToday()) + '"></div>' +
    '<div class="form-group full"><label>Notas</label><textarea id="pt_notas">' + escapeHtml(p.notas || '') + '</textarea></div>' +
  '</div>' +
  '<div style="margin-top:24px;padding-top:20px;border-top:2px solid var(--border)">' +
    '<h3 style="margin-bottom:16px;font-size:16px;color:var(--primary)">Firmas y validación</h3>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">' +
      '<div>' +
        '<label style="display:block;margin-bottom:6px;font-weight:600">Firma del Técnico</label>' +
        '<div style="border:2px dashed var(--border);border-radius:8px;padding:8px">' +
          '<canvas id="pt_firma_tecnico" data-firma-titulo="Firma del técnico" style="border:1px solid var(--border);border-radius:4px;display:block;width:100%;background:#fff"></canvas>' +
          '<div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
            '<button type="button" class="btn btn-outline btn-sm" onclick="clearFirmaCanvas(\'pt_firma_tecnico\')"><i class="fas fa-eraser"></i> Limpiar firma</button>' +
            '<small class="firma-hint" style="color:var(--text-muted)">Toca el recuadro para firmar</small>' +
          '</div>' +
        '</div>' +
        '<div class="form-group" style="margin-top:10px"><label>DNI Técnico</label><input id="pt_dni_tecnico" value="' + escapeHtml(p.empleadoDni || '') + '" placeholder="12345678Z" readonly></div>' +
      '</div>' +
      '<div>' +
        '<label style="display:block;margin-bottom:6px;font-weight:600">Firma del Cliente</label>' +
        '<div style="border:2px dashed var(--border);border-radius:8px;padding:8px">' +
          '<canvas id="pt_firma_cliente" data-firma-titulo="Firma del cliente" style="border:1px solid var(--border);border-radius:4px;display:block;width:100%;background:#fff"></canvas>' +
          '<div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
            '<button type="button" class="btn btn-outline btn-sm" onclick="clearFirmaCanvas(\'pt_firma_cliente\')"><i class="fas fa-eraser"></i> Limpiar firma</button>' +
            '<small class="firma-hint" style="color:var(--text-muted)">Toca el recuadro para firmar</small>' +
          '</div>' +
        '</div>' +
        '<div class="form-group" style="margin-top:10px"><label>DNI Cliente</label><input id="pt_dni_cliente" value="' + escapeHtml(clienteDni) + '" placeholder="12345678Z"></div>' +
      '</div>' +
    '</div>' +
  '</div>';

  const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>' +
    '<button type="button" class="btn btn-outline btn-sm" onclick="tomarFotoParte(\'' + (id || 'nuevo') + '\')"><i class="fas fa-camera"></i> Foto</button>' +
    '<button class="btn btn-primary btn-save-parte" data-action="save-parte" data-id="' + (id ? escapeHtml(id) : '') + '"><i class="fas fa-save"></i> Guardar</button>';

  openModal(id ? 'Editar Parte' : 'Nuevo Parte', form, footer);

  setTimeout(async ()=>{
    const sel = document.getElementById('pt_cliente');
    if (sel) {
      sel.addEventListener('change', async () => {
        const cli = await dbGet('clientes', sel.value);

        // --- Cálculo de KMs ---
        if (cli?.lat && cli?.lng) {
          const kms = await kmIdaVuelta({ lat: cli.lat, lng: cli.lng });
          document.getElementById('pt_kms').value = kms;
          showToast('Kms calculados: ' + kms + ' (ida+vuelta)');
        } else {
          document.getElementById('pt_kms').value = '';
          showToast('⚠️ Cliente sin coordenadas: rellena los KMs a mano y geolocalízalo en Clientes', 'error');
        }

        if (cli?.dni) {
          document.getElementById('pt_dni_cliente').value = cli.dni;
        }
        // --- Ubicaciones dinámicas ---
        const selUbicacion = document.getElementById('pt_ubicacion');
        if (selUbicacion) {
          selUbicacion.innerHTML = '<option value="">-- Selecciona una ubicación --</option>';
          if (sel.value) {
            const ubicaciones = await dbGetByIndex('ubicaciones', 'clienteId', sel.value);
            if (ubicaciones.length) {
              selUbicacion.innerHTML = '<option value="">-- Selecciona ubicación --</option>' +
                ubicaciones.map(u =>
                  '<option value="' + u.id + '" data-nombre="' + escapeHtml(u.denominacion) + '" data-direccion="' + escapeHtml(u.direccion || '') + '">' +
                    escapeHtml(u.denominacion) + (u.direccion ? ' — ' + escapeHtml(u.direccion) : '') +
                  '</option>'
                ).join('');
            } else {
              selUbicacion.innerHTML = '<option value="">Sin ubicaciones para este cliente</option>';
            }
          }
        }
        // --- Puertas dinámicas ---
        const selPuertas = document.getElementById('pt_puertas');
        if (selPuertas && sel.value) {
          const puertas = await dbGetByIndex('puertas', 'clienteId', sel.value);
          selPuertas.innerHTML = puertas.map(pu => {
            const checked = p.puertaIds && p.puertaIds.includes(pu.id) ? 'selected' : '';
            return '<option value="' + pu.id + '" ' + checked + '>' + escapeHtml(pu.nombre) + ' (' + pu.tipo + ')</option>';
          }).join('');
        } else if (selPuertas) {
          selPuertas.innerHTML = '<option value="">-- Selecciona un cliente primero --</option>';
        }
      });
    }
    const empSel = document.getElementById('pt_empleado');
    if (empSel) {
      empSel.addEventListener('change', async () => {
        const emp = await dbGet('empleados', empSel.value);
        document.getElementById('pt_dni_tecnico').value = emp?.dni || '';
        pintarFirmaEnCanvas('pt_firma_tecnico', emp?.firma || null);
      });
    }
    initFirmaCanvas('pt_firma_tecnico');
    initFirmaCanvas('pt_firma_cliente');

    if (p.empleadoId) {
      (window.isTechnician?.()
        ? Promise.resolve(window.authState.employee)
        : dbGet('empleados', p.empleadoId)).then(emp => {
        if (emp?.firma && !p.firmaTecnico) pintarFirmaEnCanvas('pt_firma_tecnico', emp.firma);
      });
    }
    if (p.firmaTecnico) {
      pintarFirmaEnCanvas('pt_firma_tecnico', p.firmaTecnico);
    }
    if (p.firmaCliente) {
      pintarFirmaEnCanvas('pt_firma_cliente', p.firmaCliente);
    }
    // --- Cargar ubicaciones si hay cliente preseleccionado (edición) ---
    if (p.clienteId) {
      const selUbicacion = document.getElementById('pt_ubicacion');
      if (selUbicacion) {
        const ubicaciones = await dbGetByIndex('ubicaciones', 'clienteId', p.clienteId);
        if (ubicaciones.length) {
          selUbicacion.innerHTML = '<option value="">-- Selecciona ubicación --</option>' +
            ubicaciones.map(u =>
              '<option value="' + u.id + '" data-nombre="' + escapeHtml(u.denominacion) + '" data-direccion="' + escapeHtml(u.direccion || '') + '" ' + (u.id === p.ubicacionId ? 'selected' : '') + '>' +
                escapeHtml(u.denominacion) + (u.direccion ? ' — ' + escapeHtml(u.direccion) : '') +
              '</option>'
            ).join('');
        } else {
          selUbicacion.innerHTML = '<option value="">Sin ubicaciones para este cliente</option>';
        }
      }
      // --- Cargar puertas si hay cliente preseleccionado (edición) ---
      const selPuertas = document.getElementById('pt_puertas');
      if (selPuertas) {
        const puertas = await dbGetByIndex('puertas', 'clienteId', p.clienteId);
        selPuertas.innerHTML = puertas.map(pu => {
          const checked = p.puertaIds && p.puertaIds.includes(pu.id) ? 'selected' : '';
          return '<option value="' + pu.id + '" ' + checked + '>' + escapeHtml(pu.nombre) + ' (' + pu.tipo + ')</option>';
        }).join('');
      }
    }
  }, 200);
};
window.saveParte = async function(id){
  id = id ? String(id) : null;
  try {
    const existingPart = id ? await dbGet('partesTrabajo', id) : null;
    const sel = document.getElementById('pt_cliente');
    const clienteId = sel.value;
    const clienteNombre = sel.options[sel.selectedIndex]?.dataset.nombre||'';
    const empSel = document.getElementById('pt_empleado');

    // --- UBICACIÓN ---
    const selUbic = document.getElementById('pt_ubicacion');
    const ubicacionId = selUbic?.value || '';
    const ubicacionNombre = selUbic?.options[selUbic.selectedIndex]?.dataset.nombre || '';
    const ubicacionDireccion = selUbic?.options[selUbic.selectedIndex]?.dataset.direccion || '';

    // --- PUERTAS (Paso 7) ---
    const puertaIds = Array.from(document.getElementById('pt_puertas')?.selectedOptions || [])
      .map(opt => opt.value);

    const dniCliente = document.getElementById('pt_dni_cliente').value.trim();
    const dniTecnico = document.getElementById('pt_dni_tecnico').value.trim();

    // --- VEHÍCULO ---
    const vehSel = document.getElementById('pt_vehiculo');
    const vehiculoId = vehSel?.value || null;
    const selOption = vehSel?.options[vehSel.selectedIndex];
    const matriculaRaw = selOption?.dataset?.matricula || null;

    // ── Validación en línea ──
    let ok = true;

    // Cliente obligatorio
    if(!clienteId){
      setFieldError('pt_cliente', 'Selecciona un cliente');
      ok = false;
    } else {
      clearFieldError('pt_cliente');
    }

    // Vehículo obligatorio
    if(!vehiculoId){
      setFieldError('pt_vehiculo', 'Selecciona un vehículo');
      ok = false;
    } else {
      clearFieldError('pt_vehiculo');
    }

    // Tipo de puerta obligatorio
    ok = setFieldError('pt_tipo', validators.required(document.getElementById('pt_tipo').value.trim(), 'El tipo de puerta')) && ok;

    // Descripción obligatoria
    ok = setFieldError('pt_desc', validators.required(document.getElementById('pt_desc').value.trim(), 'La descripción')) && ok;

    // Fecha obligatoria
    ok = setFieldError('pt_fecha', validators.required(document.getElementById('pt_fecha').value, 'La fecha')) && ok;

    // DNI técnico (si se rellena, debe ser válido)
    if(dniTecnico){
      ok = setFieldError('pt_dni_tecnico', !validarDNI(dniTecnico) ? 'DNI del técnico no válido' : '') && ok;
    } else {
      clearFieldError('pt_dni_tecnico');
    }

    // DNI cliente (si se rellena, debe ser válido)
    if(dniCliente){
      ok = setFieldError('pt_dni_cliente', !validarDNI(dniCliente) ? 'DNI del cliente no válido' : '') && ok;
    } else {
      clearFieldError('pt_dni_cliente');
    }

    if(!ok){ 
      showToast('Revisa los campos marcados','error'); 
      return; 
    }

    let firmaTecnico = null;
    if(hasSignature('pt_firma_tecnico')){
      firmaTecnico = document.getElementById('pt_firma_tecnico').toDataURL('image/png');
    }

    let firmaCliente = null;
    if(hasSignature('pt_firma_cliente')){
      firmaCliente = document.getElementById('pt_firma_cliente').toDataURL('image/png');
    }

    const parteData = {
      createdBy: existingPart?.createdBy ?? (id ? null : window.authState?.user?.id ?? null),
      clienteId, clienteNombre,
      empleadoId: empSel.value || null,
      empleadoNombre: empSel.value ? empSel.options[empSel.selectedIndex].dataset.nombre : '',
      empleadoDni: dniTecnico,
      clienteDni: dniCliente,
      tipoPuerta: document.getElementById('pt_tipo').value.trim(),
      descripcion: document.getElementById('pt_desc').value.trim(),
      vehiculoId: vehiculoId,
      matricula: (matriculaRaw || '').replace(/\s/g, '').toUpperCase(),
      kms: parseInt(document.getElementById('pt_kms').value)||0,
      horas: parseFloat(document.getElementById('pt_horas').value)||0,
      fotos: window.__fotosParte[id || 'new'] || [],
      firmaTecnico: firmaTecnico,
      firmaCliente: firmaCliente,
      estado: document.getElementById('pt_estado').value,
      fecha: document.getElementById('pt_fecha').value,
      notas: document.getElementById('pt_notas').value.trim(),
      ubicacionId,
      ubicacionNombre,
      ubicacionDireccion,
      puertaIds: puertaIds.length > 0 ? puertaIds : null
    };

    // 1. Guardar fotos PRIMERO
    try{
      parteData.fotos = await guardarFotosParte(id || 'nuevo');
    }catch(e){
      console.error('Error subiendo fotos:', e);
      showToast('Parte guardado pero sin fotos','error');
    }
    window.__fotosParte = {};

    // 2. Persistir en DB
    let parteGuardado;
    if (id) {
      parteGuardado = await dbPut('partesTrabajo', { ...parteData, id: String(id) });
    } else {
      parteGuardado = await dbCreate('partesTrabajo', parteData);
    }

    // 3. Sync
    // 4. Recalcular KMs
    if (parteGuardado.matricula) {
      await recalcVehicleKms(parteGuardado.matricula);
    }

    closeModal();
    showToast('Parte guardado');
    navigateTo('partesTrabajo');
  } catch(err){
    console.error('Error al guardar parte:', err);
    showToast('Error al guardar: ' + err.message, 'error');
  }
};

window.deleteParte = async function(id) {
  try {
    // 1. Leer el parte ANTES de borrarlo (para saber la matrícula)
    const parte = await dbGet('partesTrabajo', id);
    
    // 2. Borrar
    await dbDelete('partesTrabajo', id);

    // 3. Recalcular KMs si el parte borrado tenía vehículo
    if (parte?.matricula) {
      await recalcVehicleKms(parte.matricula);
    }

    showToast('Parte eliminado');
    navigateTo('partesTrabajo');
  } catch(err) {
    console.error('Error al eliminar parte:', err);
    showToast('Error al eliminar: ' + err.message, 'error');
  }
};
// ═══════════════════════════════════════════════════════════
//  VEHÍCULOS
// ═══════════════════════════════════════════════════════════
window.render_vehiculos = async function(el){
  const vehiculos = await dbGetAll('vehiculos');
  el.innerHTML =
    '<div class="page-header"><div><h2>Vehículos</h2><p>Gestión de flota de trabajo</p></div>'+
    '<div class="header-actions"><button class="btn btn-primary" onclick="showVehiculoForm()"><i class="fas fa-plus"></i> Nuevo Vehículo</button></div></div>'+
    '<div class="stats-grid">'+
      '<div class="stat-card"><div class="stat-icon" style="background:#dbeafe;color:#2563eb"><i class="fas fa-truck"></i></div><div class="stat-info"><h3>'+vehiculos.length+'</h3><p>Total vehículos</p></div></div>'+
      '<div class="stat-card"><div class="stat-icon" style="background:#dcfce7;color:#16a34a"><i class="fas fa-check-circle"></i></div><div class="stat-info"><h3>'+vehiculos.filter(v=>v.estado==='disponible').length+'</h3><p>Disponibles</p></div></div>'+
      '<div class="stat-card"><div class="stat-icon" style="background:#ffedd5;color:#ea580c"><i class="fas fa-route"></i></div><div class="stat-info"><h3>'+vehiculos.filter(v=>v.estado==='en_ruta').length+'</h3><p>En ruta</p></div></div>'+
    '</div>'+
    '<div class="card"><div  class="table-wrapper"><table><thead>'+
      '<tr><th>ID</th><th>Matrícula</th><th>Marca</th><th>Modelo</th><th>Año</th><th>Km</th><th>Estado</th><th>Acciones</th></tr>'+
    '</thead><tbody id="vehBody"></tbody></table></div></div>';
  renderVehiculos();
};

window.renderVehiculos = async function(){
  const vehiculos = await dbGetAll('vehiculos');
  document.getElementById('vehBody').innerHTML = vehiculos.map(v=>{
    let itvClass = 'badge-gray';
    let itvLabel = '—';
    if(v.itv && v.itv !== ''){
      const hoy = new Date();
      const itvDate = new Date(v.itv);
      hoy.setHours(0,0,0,0);
      itvDate.setHours(0,0,0,0);
      const diffTime = itvDate - hoy;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if(diffDays < 0) {
        itvClass = 'badge-red';
        itvLabel = 'Vencida';
      } else if(diffDays <= 30) { 
        itvClass = 'badge-yellow';
        itvLabel = 'Próxima (' + diffDays + 'd)';
      } else {
        itvClass = 'badge-green';
        itvLabel = formatDate(v.itv);
      }
    }
    return '<tr><td>'+escapeHtml(v.id)+'</td><td><strong>'+escapeHtml(v.matricula)+'</strong></td><td>'+escapeHtml(v.marca)+'</td>'+
      '<td>'+escapeHtml(v.modelo)+'</td><td>'+v.anno+'</td><td>'+v.km.toLocaleString('es-ES')+'</td>'+
      '<td><span class="badge '+(itvClass)+'">'+itvLabel+'</span></td>'+
      '<td><span class="badge badge-gray">'+getStatusLabel(v.estado)+'</span></td>'+
      '<td class="actions-cell">'+
        '<button class="btn btn-outline btn-sm btn-icon" title="Editar" data-action="edit-vehiculo" data-id="'+escapeHtml(v.id)+'"><i class="fas fa-pen"></i></button>'+
        '<button class="btn btn-outline btn-sm btn-icon btn-action-success" title="ITV realizada" onclick="showConfirmITV(\''+v.id+'\')"><i class="fas fa-calendar-check"></i></button>'+
        '<button class="btn btn-outline btn-sm btn-icon" title="Cambiar estado" onclick="toggleVehiculoEstado(\''+v.id+'\')"><i class="fas fa-right-left"></i></button>'+
        '<button class="btn btn-outline btn-sm btn-icon" title="Eliminar" onclick="confirmDelete(\'Vehículo '+escapeHtml(v.matricula)+'\', ()=>deleteVehiculo(\''+v.id+'\'))"><i class="fas fa-trash"></i></button>'+
      '</td></tr>';
  }).join('') || '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-muted)">Sin vehículos</td></tr>';
};

window.deleteVehiculo = async function(id){
  await dbDelete('vehiculos',id);
  showToast('Vehículo eliminado');navigateTo('vehiculos');
};

// ═══════════════════════════════════════════════════════════
//  ITV
// ═══════════════════════════════════════════════════════════
window.marcarITVPasada = async function(id){
  try {
    const v = await dbGet('vehiculos', id);
    if(!v){ showToast('Vehículo no encontrado','error'); return; }
    const nuevaFecha = new Date();
    nuevaFecha.setMonth(nuevaFecha.getMonth() + 6);
    const itvStr = nuevaFecha.toISOString().split('T')[0];
    v.itv = itvStr;
    await dbPut('vehiculos', v);
    closeModal();
    showToast('✅ ITV registrada. Próxima: ' + formatDate(itvStr));
    navigateTo('vehiculos');
  } catch(err){
    console.error('Error al registrar ITV:', err);
    showToast('Error al registrar ITV: '+err.message,'error');
  }
};

window.showConfirmITV = function(id){
  const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary btn-confirm-itv" data-action="confirm-itv" data-id="'+escapeHtml(id)+'"><i class="fas fa-check"></i> Confirmar ITV</button>';
  openModal('Registrar ITV',
    '<p>Se registrará la ITV como <strong>realizada hoy</strong>.</p>'+
    '<p style="margin-top:12px">La próxima ITV se fijará automáticamente <strong>6 meses después</strong>.</p>',
    footer);
};

window.showVehiculoForm = async function(id){
  id = id ? String(id) : null;
  const v = id ? await dbGet('vehiculos',id) : {};
  const nextId = v.id || window.db.nextId('VEH');
  const defaultItv = v.itv || new Date(new Date().setFullYear(new Date().getFullYear() + 4)).toISOString().split('T')[0];

  const form = '<div class="form-grid">'+
    '<div class="form-group"><label>ID</label><input id="vh_id" value="'+escapeHtml(nextId)+'"></div>'+
    '<div class="form-group"><label>Matrícula *</label><input id="vh_mat" value="'+escapeHtml(v.matricula||'')+'" style="text-transform:uppercase"></div>'+
    '<div class="form-group"><label>Marca</label><input id="vh_marca" value="'+escapeHtml(v.marca||'')+'"></div>'+
    '<div class="form-group"><label>Modelo</label><input id="vh_modelo" value="'+escapeHtml(v.modelo||'')+'"></div>'+
    '<div class="form-group"><label>Año</label><input id="vh_anno" type="number" class="only-num" value="'+(v.anno||new Date().getFullYear())+'"></div>'+
    '<div class="form-group"><label>Kilómetros</label><input id="vh_km" type="number" class="only-num" value="'+(v.km||0)+'"></div>'+
    '<div class="form-group"><label>ITV (Próxima)</label><input id="vh_itv" type="date" value="'+escapeHtml(defaultItv)+'"></div>'+
    '<div class="form-group"><label>Estado</label><select id="vh_estado">'+
      ['disponible','en_ruta','en_mantenimiento'].map(e=>'<option value="'+e+'" '+(v.estado===e?'selected':'')+'>'+getStatusLabel(e)+'</option>').join('')+'</select></div>'+
    '<div class="form-group full"><label>Notas</label><textarea id="vh_nota">'+escapeHtml(v.nota||'')+'</textarea></div>'+
  '</div>';

  const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary btn-save-vehiculo" data-action="save-vehiculo" data-id="'+(id ? escapeHtml(id) : '')+'"><i class="fas fa-save"></i> Guardar</button>';
  openModal(id?'Editar Vehículo':'Nuevo Vehículo',form,footer);
};


window.saveVehiculo = async function(id){
  id = id ? String(id) : null;
  try {
    const data = {
      id: document.getElementById('vh_id').value.trim() || null,
      matricula: document.getElementById('vh_mat').value.trim().replace(/\s/g,'').toUpperCase(),
      marca: document.getElementById('vh_marca').value.trim(),
      modelo: document.getElementById('vh_modelo').value.trim(),
      anno: parseInt(document.getElementById('vh_anno').value)||new Date().getFullYear(),
      km: parseInt(document.getElementById('vh_km').value)||0,
      km_inicial: parseInt(document.getElementById('vh_km').value)||0,
      itv: document.getElementById('vh_itv').value,
      estado: document.getElementById('vh_estado').value,
      nota: document.getElementById('vh_nota').value.trim()
    };
    if(!data.matricula){ showToast('La matrícula es obligatoria','error'); return; }

    if (id) { await window.db.dbPut('vehiculos', data); }
    else    { const r = await window.db.dbAdd('vehiculos', data); data.id = r.id; }

    closeModal();
    showToast('Vehículo guardado');
    navigateTo('vehiculos');
  } catch(err){
    console.error('Error al guardar vehículo:', err);
    showToast('Error al guardar: '+err.message,'error');
  }
};

window.toggleVehiculoEstado = async function(id){
  const v = await dbGet('vehiculos',id);
  if(!v) return;
  v.estado = v.estado==='disponible' ? 'en_ruta' : 'disponible';
  await dbPut('vehiculos',v);
  showToast('Estado actualizado a: '+getStatusLabel(v.estado));
  navigateTo('vehiculos');
};

// ═══════════════════════════════════════════════════════════
//  ALMACÉN
// ═══════════════════════════════════════════════════════════
window.render_almacen = async function(el){
  el.innerHTML =
    '<div class="page-header"><div><h2>Almacén</h2><p>Control de stock y artículos</p></div>'+
    '<div class="header-actions">'+
      '<button class="btn btn-primary" onclick="showArticuloForm()"><i class="fas fa-plus"></i> Nuevo Artículo</button>'+
      '<button class="btn btn-outline" onclick="generatePDF_almacen()"><i class="fas fa-file-pdf"></i> PDF</button></div></div>'+
    '<div class="search-bar">'+
      '<input type="text" placeholder="Buscar artículo..." id="searchArt" oninput="renderAlmacen()">'+
      '<select id="filterCatArt" onchange="renderAlmacen()"><option value="">Todas</option>'+
      '<option value="producto">Producto</option><option value="recambio">Recambio</option><option value="servicio">Servicio</option></select></div>'+
    '<div class="card"><div  class="table-wrapper"><table><thead>'+
      '<tr><th>Referencia</th><th>Nombre</th><th>Categoría</th><th>Stock</th><th>Mín.</th><th>P. Venta</th><th>Estado</th><th>Acciones</th></tr>'+
    '</thead><tbody id="artBody"></tbody></table></div></div>';
  renderAlmacen();
};

window.renderAlmacen = async function(){
  const items = await dbGetAll('almacen');
  const q = (document.getElementById('searchArt')?.value||'').toLowerCase();
  const cat = document.getElementById('filterCatArt')?.value||'';
  const filtered = items.filter(a=>{
    if(q && !JSON.stringify(a).toLowerCase().includes(q)) return false;
    if(cat && a.categoria!==cat) return false;
    return true;
  });
  document.getElementById('artBody').innerHTML = filtered.map(a=>{
    const bajo = a.stock <= a.stockMinimo;
    return '<tr><td><strong>'+escapeHtml(a.referencia)+'</strong></td><td>'+escapeHtml(a.nombre)+'</td>'+
      '<td><span class="badge badge-blue">'+(a.categoria||'—')+'</span></td>'+
      '<td style="font-weight:700;color:'+(bajo?'var(--danger)':'var(--text)')+'">'+a.stock+'</td>'+
      '<td>'+a.stockMinimo+'</td><td>'+formatCurrency(a.precioVenta)+'</td>'+
      '<td><span class="badge '+(bajo?'badge-red':'badge-green')+'">'+(bajo?'Stock bajo':'OK')+'</span></td>'+
      '<td class="actions-cell">'+
        '<button class="btn btn-outline btn-sm btn-icon" title="Editar" data-action="edit-articulo" data-id="'+escapeHtml(a.id)+'"><i class="fas fa-pen"></i></button>'+
        '<button class="btn btn-outline btn-sm btn-icon" title="Ajustar stock" onclick="ajustarStock(\''+a.id+'\')"><i class="fas fa-arrows-rotate"></i></button>'+
        '<button class="btn btn-outline btn-sm btn-icon" title="Eliminar" onclick="confirmDelete(\'Artículo '+escapeHtml(a.nombre)+'\', ()=>deleteArticulo(\''+a.id+'\'))"><i class="fas fa-trash"></i></button>'+
      '</td></tr>';
  }).join('') || '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">Sin artículos</td></tr>';
};

window.deleteArticulo = async function(id){
  await dbDelete('almacen',id);
  showToast('Artículo eliminado');navigateTo('almacen');
};

window.showArticuloForm = async function(id){
  id = id ? String(id) : null;
  const a = id ? await dbGet('almacen',id) : {};
  const nextId = a.id || window.db.nextId('ART');

  const form = '<div class="form-grid">'+
    '<div class="form-group"><label>Referencia</label><input id="ar_ref" value="'+escapeHtml(a.referencia||'')+'"></div>'+
    '<div class="form-group"><label>Categoría</label><select id="ar_cat">'+
      ['producto','recambio','servicio'].map(c=>'<option value="'+c+'" '+(a.categoria===c?'selected':'')+'>'+c.charAt(0).toUpperCase()+c.slice(1)+'</option>').join('')+'</select></div>'+
    '<div class="form-group full"><label>Nombre *</label><input id="ar_nom" value="'+escapeHtml(a.nombre||'')+'"></div>'+
    '<div class="form-group"><label>Unidad</label><input id="ar_unid" value="'+escapeHtml(a.unidad||'unidad')+'"></div>'+
    '<div class="form-group"><label>Stock</label><input id="ar_stock" type="number" class="only-num" value="'+(a.stock||0)+'"></div>'+
    '<div class="form-group"><label>Stock mínimo</label><input id="ar_min" type="number" class="only-num" value="'+(a.stockMinimo||0)+'"></div>'+
   '<div class="form-group"><label>Precio compra</label><input id="ar_pc" type="number" class="only-num-dec" step="0.01" value="'+formatoPrecioES(a.precioCompra)+'"></div>'+
'<div class="form-group"><label>Precio venta</label><input id="ar_pv" type="number" class="only-num-dec" step="0.01" value="'+formatoPrecioES(a.precioVenta)+'"></div>'+
    '<div class="form-group"><label>Proveedor</label><input id="ar_prov" value="'+escapeHtml(a.proveedor||'')+'"></div>'+
  '</div>';

  const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary btn-save-articulo" data-action="save-articulo" data-id="'+(id ? escapeHtml(id) : '')+'"><i class="fas fa-save"></i> Guardar</button>';
  openModal(id?'Editar Artículo':'Nuevo Artículo',form,footer);
};

window.saveArticulo = async function(id){
  id = id ? String(id) : null;
  try {
    const ref = document.getElementById('ar_ref').value.trim();
    const data = {
      id: ref || window.db.nextId('ART'),
      referencia: ref,
      nombre: document.getElementById('ar_nom').value.trim(),
      unidad: document.getElementById('ar_unid').value.trim(),
      categoria: document.getElementById('ar_cat').value,
      stock: parseInt(document.getElementById('ar_stock').value)||0,
      stockMinimo: parseInt(document.getElementById('ar_min').value)||0,
      precioCompra: parseFloat(document.getElementById('ar_pc').value)||0,
      precioVenta: parseFloat(document.getElementById('ar_pv').value)||0,
      proveedor: document.getElementById('ar_prov').value.trim()
    };
    if(!data.nombre){ showToast('El nombre es obligatorio','error'); return; }
    await dbPut('almacen', data);
    closeModal();
    showToast('Artículo guardado');
    navigateTo('almacen');
  } catch(err){
    console.error('Error al guardar artículo:', err);
    showToast('Error al guardar: '+err.message,'error');
  }
};

window.ajustarStock = async function(id){
  const a = await dbGet('almacen',id);
  if(!a) return;
  const form = '<div class="form-group"><label>Ajustar stock de: <strong>'+escapeHtml(a.nombre)+'</strong> (actual: '+a.stock+')</label></div>'+
    '<div class="form-grid" style="margin-top:12px">'+
      '<div class="form-group"><label>Entrada (+)</label><input id="as_ent" type="number" class="only-num" value="0" min="0"></div>'+
      '<div class="form-group"><label>Salida (-)</label><input id="as_sal" type="number" class="only-num" value="0" min="0"></div>'+
    '</div>'+
    '<p style="margin-top:12px;font-size:13px;color:var(--text-muted)">Nuevo stock: <strong id="as_new">'+a.stock+'</strong></p>';
     const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="applyStock(\''+id+'\')"><i class="fas fa-check"></i> Aplicar</button>';
  openModal('Ajustar Stock',form,footer);
  setTimeout(()=>{
    ['as_ent','as_sal'].forEach(fid=>{
      document.getElementById(fid)?.addEventListener('input',()=>{
        const e=parseInt(document.getElementById('as_ent').value)||0;
        const s=parseInt(document.getElementById('as_sal').value)||0;
        document.getElementById('as_new').textContent = Math.max(0,a.stock+e-s);
      });
    });
  },100);
};

window.applyStock = async function(id){
  const a = await dbGet('almacen',id);
  const e = parseInt(document.getElementById('as_ent').value)||0;
  const s = parseInt(document.getElementById('as_sal').value)||0;
  a.stock = Math.max(0,a.stock+e-s);
  await dbPut('almacen',a);
  closeModal();showToast('Stock actualizado: '+a.stock);navigateTo('almacen');
};

// ═══════════════════════════════════════════════════════════
//  CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════
window.render_configuracion = async function(el){
  el.innerHTML =
    '<div class="page-header"><div><h2>Configuración</h2><p>Ajustes de la aplicación</p></div></div>'+
    '<section class="config-shortcuts"><h3>Accesos directos</h3><div class="config-shortcut-grid">'+
      '<button class="btn btn-primary" onclick="navigateTo(\'empleados\')"><i class="fas fa-users-gear"></i> Empleados</button>'+ 
      '<button class="btn btn-primary" onclick="navigateTo(\'vehiculos\')"><i class="fas fa-truck"></i> Vehículos</button>'+ 
      '<button class="btn btn-primary" onclick="navigateTo(\'estadisticas\')"><i class="fas fa-chart-bar"></i> Estadísticas</button>'+ 
      '<button class="btn btn-primary" onclick="navigateTo(\'almacen\')"><i class="fas fa-boxes-stacked"></i> Almacén</button>'+ 
      '<button class="btn btn-primary" onclick="navigateTo(\'informesKms\')"><i class="fas fa-chart-pie"></i> Informes KMs</button>'+ 
    '</div></section>'+
    '<div class="card" style="margin-top:20px">'+
      '<div class="card-header"><h3>Sincronización de datos</h3></div>'+
      '<div class="card-body">'+
        '<p style="margin-bottom:12px;color:var(--text-muted)">Los datos se sincronizan online con Supabase y se mantienen en caché local para consulta. La exportación e importación JSON están disponibles como respaldo adicional.</p>'+
        '<div style="display:flex;gap:12px;flex-wrap:wrap">'+
          '<button class="btn btn-primary" onclick="exportAllData()"><i class="fas fa-download"></i> Exportar datos (JSON)</button>'+
          '<button class="btn btn-outline" onclick="document.getElementById(\'importFile\').click()"><i class="fas fa-upload"></i> Importar datos</button>'+
          '<input type="file" id="importFile" accept=".json" style="display:none" onchange="importAllData(event)">'+
          '<button class="btn btn-danger" onclick="confirmDelete(\'Todos los datos de la aplicación\', ()=>clearAllData())"><i class="fas fa-trash"></i> Borrar todos los datos</button>'+
        '</div>'+
      '</div>'+
    '</div>'+
    '<div class="card" style="margin-top:20px">'+
      '<div class="card-header"><h3>Instalación en Android</h3></div>'+
      '<div class="card-body">'+
        '<p style="color:var(--text-muted);font-size:14px">Abre esta app en <strong>Chrome para Android</strong> y pulsa el menú <strong>⋮ → "Instalar aplicación"</strong>. Quedará como una app nativa en tu escritorio y funcionará sin conexión.</p>'+
      '</div>'+
    '</div>'+
    '<div class="card" style="margin-top:20px">'+
      '<div class="card-header"><h3>Información</h3></div>'+
      '<div class="card-body">'+
        '<p><strong>Valgom</strong> v1.0</p>'+
        '<p style="color:var(--text-muted);margin-top:4px">PWA · IndexedDB · Funciona offline · Exporta PDF</p>'+
      '</div>'+
    '</div>'+
    '<div style="margin-top:20px; padding-top:20px; border-top:1px solid var(--border);">'+
      '<h3 style="margin:0 0 12px 0; font-size:16px;">Cadenas y Rutas</h3>'+
      '<p style="color:var(--gray);font-size:13px;margin-bottom:12px;">Gestiona las cadenas de mantenimiento y sus rutas asociadas.</p>'+
      '<button class="btn btn-primary" id="btn-gestion-cadenas">Gestionar Cadenas y Rutas</button>'+
    '</div>';

  // Listener para la gestión de cadenas
  const btnGestion = document.getElementById('btn-gestion-cadenas');
  if (btnGestion) {
    btnGestion.addEventListener('click', () => {
      navigateTo('cadenas');
    });
  }
};

window.exportAllData = async function(){
  const data = {};
  for(const store of STORES){
    if(store === 'syncQueue') continue;
    data[store] = await dbGetAll(store);
  }
  downloadJSON(data,'autopuerta_backup_'+getToday()+'.json');
  showToast('Datos exportados correctamente');
};

window.importAllData = async function(e){
  const file = e.target.files[0];
  if(!file) return;
  const text = await file.text();
  try{
    const data = JSON.parse(text);
    let count = 0;
    for(const [store,items] of Object.entries(data)){
      if(!Array.isArray(items)) continue;
      for(const item of items){
        if(item.id){
          await dbPut(store,{...item,updatedAt:new Date().toISOString()});
          count++;
        }
      }
    }
    showToast(count+' registros importados');
    navigateTo(currentPage);
  }catch(err){
    showToast('Error al importar: '+err.message,'error');
  }
};

window.clearAllData = function(){
  const req = indexedDB.deleteDatabase(DB_NAME);
  req.onsuccess = ()=>{
    dbInstance = null;
    showToast('Datos borrados. La app se recargará.');
    setTimeout(()=>location.reload(),1500);
  };
};

window.__fotosParte = {};

window.tomarFotoParte = function(parteId){
  abrirCamara(parteId, function(base64){
    if(!window.__fotosParte[parteId]) window.__fotosParte[parteId] = [];
    window.__fotosParte[parteId].push(base64);
    showToast('Foto capturada (' + window.__fotosParte[parteId].length + ')');
    actualizarMiniaturas(parteId);
  });
};

function actualizarMiniaturas(parteId){
  let container = document.getElementById('fotos_' + parteId.replace(/[^a-zA-Z0-9]/g,'_'));
  if(!container){
    const form = document.querySelector('.form-grid');
    if(form){
      container = document.createElement('div');
      container.id = 'fotos_' + parteId.replace(/[^a-zA-Z0-9]/g,'_');
      container.style.cssText = 'margin-top:12px;';
      container.innerHTML = '<label>Fotos</label><div style="display:flex;gap:8px;flex-wrap:wrap" id="thumbs_' + parteId.replace(/[^a-zA-Z0-9]/g,'_') + '"></div>';
      form.appendChild(container);
    }
  }
  const thumbs = document.getElementById('thumbs_' + parteId.replace(/[^a-zA-Z0-9]/g,'_'));
  if(!thumbs) return;
  thumbs.innerHTML = (window.__fotosParte[parteId]||[]).map((f,i)=>
    '<div style="position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:2px solid var(--primary)">'+
      '<img src="'+f+'" style="width:100%;height:100%;object-fit:cover;">'+
      '<button type="button" onclick="eliminarFotoParte(\''+parteId+'\','+i+')" style="position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:#dc2626;color:#fff;border:none;cursor:pointer;font-size:12px;">×</button>'+
    '</div>'
  ).join('') || '';
};

window.eliminarFotoParte = function(parteId, idx){
  if(window.__fotosParte[parteId]){
    window.__fotosParte[parteId].splice(idx, 1);
    actualizarMiniaturas(parteId);
  }
};

window.guardarFotosParte = async function(parteId){
  if(!window.__fotosParte[parteId] || !window.__fotosParte[parteId].length) return [];
  const urls = [];
  for(const foto of window.__fotosParte[parteId]){
    try{
      const url = await subirFoto(parteId, foto);
      urls.push(url);
    }catch(e){
      console.error('Error al subir foto:', e);
    }
  }
  return urls;
};

// ═══════════════════════════════════════════════════════════
//  EMPLEADOS
// ═══════════════════════════════════════════════════════════
window.render_empleados = async function(el){
  el.innerHTML =
    '<div class="page-header"><div><h2>Empleados</h2><p>Gestión del equipo técnico</p></div>'+
    '<div class="header-actions"><button class="btn btn-primary" onclick="showEmpleadoForm()"><i class="fas fa-plus"></i> Nuevo Empleado</button></div></div>'+
    '<div class="search-bar"><input type="text" placeholder="Buscar empleado..." id="searchEmp" oninput="renderEmpleados()"></div>'+
    '<div class="card"><div  class="table-wrapper"><table><thead>'+
      '<tr><th>ID</th><th>Nombre</th><th>Teléfono</th><th>DNI</th><th>Email</th><th>Acciones</th></tr>'+
    '</thead><tbody id="empBody"></tbody></table></div></div>';
  renderEmpleados();
};

window.renderEmpleados = async function(){
  const empleados = await dbGetAll('empleados');
  const q = (document.getElementById('searchEmp')?.value||'').toLowerCase();
  const filtered = empleados.filter(e=>JSON.stringify(e).toLowerCase().includes(q));
  document.getElementById('empBody').innerHTML = filtered.map(e=>
    '<tr><td><strong>'+escapeHtml(e.id)+'</strong></td><td>'+escapeHtml(e.nombre)+'</td>'+
    '<td>'+escapeHtml(e.telefono||'—')+'</td>'+
    '<td>'+escapeHtml(e.dni||'—')+'</td>'+
    '<td>'+escapeHtml(e.email||'—')+'</td>'+
    '<td class="actions-cell">'+
      '<button class="btn btn-outline btn-sm btn-icon" title="Editar" onclick="showEmpleadoForm(\''+e.id+'\')"><i class="fas fa-pen"></i></button>'+
      '<button class="btn btn-outline btn-sm btn-icon" title="Eliminar" onclick="confirmDelete(\'Empleado '+escapeHtml(e.nombre)+'\', ()=>deleteEmpleado(\''+e.id+'\'))"><i class="fas fa-trash"></i></button>'+
    '</td></tr>'
  ).join('') || '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">Sin empleados</td></tr>';
};

window.showEmpleadoForm = async function(id){
  id = id ? String(id) : null;
  const e = id ? await dbGet('empleados',id) : {};
  const nextId = e.id || window.db.nextId('EMP');

  const form = '<div class="form-grid">'+
    '<div class="form-group"><label>ID</label><input id="em_id" value="'+escapeHtml(nextId)+'"></div>'+
    '<div class="form-group"><label>Nombre completo *</label><input id="em_nombre" value="'+escapeHtml(e.nombre||'')+'" required></div>'+
    '<div class="form-group"><label>Teléfono</label><input id="em_telefono" class="only-num" value="'+(e.telefono ? String(e.telefono).replace(/\D/g,'') : '')+'"></div>'+
    '<div class="form-group"><label>DNI/NIE</label><input id="em_dni" oninput="this.value=this.value.toUpperCase()" value="'+escapeHtml(e.dni||'')+'"></div>'+
    '<div class="form-group"><label>Email</label><input id="em_email" type="email" value="'+escapeHtml(e.email||'')+'"></div>'+
    '<div class="form-group">'+
      '<label>Firma del empleado</label>'+
      '<div style="border:2px dashed var(--border);border-radius:8px;padding:8px">'+
        '<canvas id="em_firma_canvas" style="border:1px solid var(--border);border-radius:4px;touch-action:none;display:block;width:100%;height:120px;background:transparent"></canvas>'+
        '<div style="margin-top:8px;display:flex;gap:8px">'+
          '<button type="button" class="btn btn-outline btn-sm" onclick="clearFirmaCanvas(\'em_firma_canvas\');document.getElementById(\'em_load_firma\').style.display=\'none\'"><i class="fas fa-eraser"></i> Limpiar firma</button>'+
          '<button type="button" class="btn btn-outline btn-sm" id="em_load_firma" style="display:'+(e.firma?'inline-flex':'none')+'"><i class="fas fa-upload"></i> Cargar firma</button>'+
          '<input type="file" id="em_load_firma_input" accept="image/*" style="display:none">'+
        '</div>'+
      '</div>'+
    '</div>'+
  '</div>';

  const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="saveEmpleado(' + (id ? "'"+escapeHtml(id)+"'" : 'null') + ')"><i class="fas fa-save"></i> Guardar</button>';
  openModal(id?'Editar Empleado':'Nuevo Empleado',form,footer);

  setTimeout(()=>{
    initFirmaCanvas('em_firma_canvas');
    if(e.firma){
      pintarFirmaEnCanvas('em_firma_canvas', e.firma);
    }
    document.getElementById('em_load_firma')?.addEventListener('click',()=>{
      document.getElementById('em_load_firma_input').click();
    });
    document.getElementById('em_load_firma_input')?.addEventListener('change',function(){
      const file = this.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = function(ev){
        pintarFirmaEnCanvas('em_firma_canvas', ev.target.result);
        document.getElementById('em_load_firma').style.display = 'none';
      };
      reader.readAsDataURL(file);
      this.value = '';
    });
  }, 150);
};

window.saveEmpleado = async function(id) {
  id = id ? String(id) : null;
  
  // Validar campos antes de guardar
  const validators = {
    required: (v) => v.length > 0,
    dni: (v) => /^[0-9]{8}[\w]$/i.test(v),
    telefono9: (v) => /^[679]\d{8}$/.test(v),
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  };

  const nombre = document.getElementById('em_nombre').value.trim();
  const telefono = document.getElementById('em_telefono').value.trim();
  const dni = document.getElementById('em_dni').value.trim().toUpperCase();
  const email = document.getElementById('em_email').value.trim();
  const firma = document.getElementById('em_firma_canvas');

  // Limpiar errores previos
  clearAllFieldErrors(['em_nombre', 'em_telefono', 'em_dni', 'em_email', 'em_firma_canvas']);

  // Validar nombre
  if (!validators.required(nombre)) {
    setFieldError('em_nombre', 'El nombre es obligatorio');
    return;
  }

  // Validar DNI (8 dígitos + letra)
  if (!validators.dni(dni)) {
    setFieldError('em_dni', 'DNI no válido (ej: 12345678A)');
    return;
  }

  // Validar teléfono (9 dígitos, empieza por 6, 7 o 9)
  if (!validators.telefono9(telefono)) {
    setFieldError('em_telefono', 'Teléfono no válido (9 dígitos, 6/7/9)');
    return;
  }

  // Validar email (opcional, pero si se rellena debe ser válido)
  if (email && !validators.email(email)) {
    setFieldError('em_email', 'Email no válido');
    return;
  }

  // Validar firma
  if (!firma || !hasSignature('em_firma_canvas')) {
    setFieldError('em_firma_canvas', 'Firma obligatoria');
    return;
  }

  try {
    const data = {
      id: id,
      nombre: nombre,
      telefono: telefono,
      dni: dni,
      email: email,
      firma: firma.toDataURL('image/png')
    };

    if (id) { await window.db.dbPut('empleados', data); }
else    { const r = await window.db.dbAdd('empleados', data); data.id = r.id; }
    closeModal();
    showToast('Empleado guardado');
    navigateTo('empleados');
  } catch(err) {
    console.error('Error al guardar empleado:', err);
    showToast('Error al guardar: ' + err.message, 'error');
  }

};

window.deleteEmpleado = async function(id){
  await dbDelete('empleados',id);
  showToast('Empleado eliminado');
  navigateTo('empleados');
};

window.render_estadisticas = async function(el){
  el.innerHTML =
    '<div class="page-header"><div><h2>Estadísticas</h2><p>Análisis de actividad y rendimiento</p></div></div>'+
    '<div class="stats-grid">'+
      '<div class="stat-card"><div class="stat-value" id="stat-total">0</div><div class="stat-label">Total Partes</div></div>'+
      '<div class="stat-card"><div class="stat-value" id="stat-completados">0</div><div class="stat-label">Completados</div></div>'+
      '<div class="stat-card"><div class="stat-value" id="stat-abiertos">0</div><div class="stat-label">Abiertos</div></div>'+
      '<div class="stat-card"><div class="stat-value" id="stat-horas">0</div><div class="stat-label">Horas Totales</div></div>'+
    '</div>'+
    '<div class="card" style="margin-top:20px"><h3 style="margin-bottom:15px">Partes por Mes</h3><canvas id="chartMeses"></canvas></div>'+
    '<div class="card" style="margin-top:20px"><h3 style="margin-bottom:15px">Partes por Técnico</h3><canvas id="chartTecnicos"></canvas></div>'+
    '<div class="card" style="margin-top:20px"><h3 style="margin-bottom:15px">Partes por Tipo de Puerta</h3><canvas id="chartTipos"></canvas></div>';

  await pintarEstadisticas();
};

window.pintarEstadisticas = async function(){
  const partes = await dbGetAll('partesTrabajo');

  // ── Contadores generales ──
  const total = partes.length;
  const completados = partes.filter(p=>p.estado==='completado').length;
  const abiertos = partes.filter(p=>p.estado==='abierto').length;
  const horasTotal = partes.reduce((sum,p)=> sum + (parseFloat(p.horas)||0), 0);

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-completados').textContent = completados;
  document.getElementById('stat-abiertos').textContent = abiertos;
  document.getElementById('stat-horas').textContent = horasTotal.toFixed(1);

  // ── Destruir gráficos anteriores si existen ──
  const charts = ['chartMeses','chartTecnicos','chartTipos'];
  charts.forEach(id=>{
    const existing = Chart.getChart(id);
    if(existing) existing.destroy();
  });

  // ── Partes por Mes ──
  const meses = {};
  partes.forEach(p=>{
    const mes = p.fecha ? p.fecha.substring(0,7) : 'Sin fecha';
    meses[mes] = (meses[mes]||0) + 1;
  });
  const mesesOrdenados = Object.keys(meses).sort();
  new Chart(document.getElementById('chartMeses'), {
    type: 'line',
    data: {
      labels: mesesOrdenados,
      datasets: [{
        label: 'Partes',
        data: mesesOrdenados.map(m=>meses[m]),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        fill: true,
        tension: 0.3
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  // ── Partes por Técnico ──
  const tecnicos = {};
  partes.forEach(p=>{
    const nombre = p.empleadoNombre || 'Sin asignar';
    tecnicos[nombre] = (tecnicos[nombre]||0) + 1;
  });
  const tecnicosOrdenados = Object.keys(tecnicos).sort((a,b)=>tecnicos[b]-tecnicos[a]);
  new Chart(document.getElementById('chartTecnicos'), {
    type: 'bar',
    data: {
      labels: tecnicosOrdenados,
      datasets: [{
        label: 'Partes',
        data: tecnicosOrdenados.map(t=>tecnicos[t]),
        backgroundColor: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899']
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  // ── Partes por Tipo de Puerta ──
  const tipos = {};
  partes.forEach(p=>{
    const tipo = p.tipoPuerta || 'Sin especificar';
    tipos[tipo] = (tipos[tipo]||0) + 1;
  });
  const tiposOrdenados = Object.keys(tipos).sort((a,b)=>tipos[b]-tipos[a]);
  new Chart(document.getElementById('chartTipos'), {
    type: 'doughnut',
    data: {
      labels: tiposOrdenados,
      datasets: [{
        data: tiposOrdenados.map(t=>tipos[t]),
        backgroundColor: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16']
      }]
    },
    options: { responsive: true }
  });
};
// ═══════════════════════════════════════════════════
//  UTILIDADES KMS POR JORNADA   ← van ANTES, a nivel global
// ═══════════════════════════════════════════════════
// BASE_CEUTI y FACTOR_CARETERA ya están definidas en utils.js — no duplicar
const OFICINA = BASE_CEUTI;   // alias para no tocar el resto del código de pages.js

function kmEntreCoordenadas(lat1, lng1, lat2, lng2){
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
            Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function calcularKmJornada(partesDelDia){
  if (!partesDelDia.length) return null; // null = "no puedo calcular" -> activará fallback

  // Recoger coordenadas ÚNICAS de cliente del día
  const coordsMap = {};
  for (const p of partesDelDia) {
    if (coordsMap[p.clienteId]) continue;
    const cli = await dbGet('clientes', p.clienteId);
    if (!cli?.lat || !cli?.lng) return null;      // falta coord -> señal de fallback
    coordsMap[p.clienteId] = { lat: cli.lat, lng: cli.lng };
  }

  const puntos = Object.values(coordsMap);

  // Un solo destino: oficina -> cliente -> oficina (ruta real, NO p.kms)
  if (puntos.length === 1) {
    const c = puntos[0];
    const ida  = kmEntreCoordenadas(OFICINA.lat, OFICINA.lng, c.lat, c.lng) * FACTOR_CARETERA;
    const vuel = kmEntreCoordenadas(c.lat, c.lng, OFICINA.lat, OFICINA.lng) * FACTOR_CARETERA;
    return Math.round(ida + vuel);
  }

  // Varios destinos: vecino más cercano desde la oficina y vuelta
  const pendientes = [...puntos];
  let actual = OFICINA, total = 0;
  while (pendientes.length) {
    let mejorIdx = 0, mejorDist = Infinity;
    pendientes.forEach((c, i) => {
      const d = kmEntreCoordenadas(actual.lat, actual.lng, c.lat, c.lng) * FACTOR_CARETERA;
      if (d < mejorDist) { mejorDist = d; mejorIdx = i; }
    });
    total += mejorDist;
    actual = pendientes.splice(mejorIdx, 1)[0];
  }
  total += kmEntreCoordenadas(actual.lat, actual.lng, OFICINA.lat, OFICINA.lng) * FACTOR_CARETERA;
  return Math.round(total);
}

// ═══════════════════════════════════════════════════
//  RECALCULO DE KMS DE VEHÍCULOS
// ═══════════════════════════════════════════════════
/** Recalcular KMs de un vehículo por matrícula. */
window.recalcVehicleKms = async function(matricula) {
  if (!matricula) return null;
  try {
    // Index compuesto: matricula + fecha
    const range = IDBKeyRange.bound([matricula, ''], [matricula, '\uffff'], false, false);
    const partes = await dbGetByIndexRange('partesTrabajo', 'matricula_fecha', range);

    const vehiculos = await dbGetAll('vehiculos');
    const vehiculo = vehiculos.find(v => v.matricula === matricula);
    if (!vehiculo) {
      console.warn('[recalcVehicleKms] Vehículo no encontrado:', matricula);
      return null;
    }

    // ── Fijar base SIEMPRE en km_inicial (si no existe, tomar el valor actual una vez) ──
    if (vehiculo.km_inicial == null) {
      vehiculo.km_inicial = Number(vehiculo.km) || 0;
      await dbPut('vehiculos', vehiculo);
    }
    const kmIncial = Number(vehiculo.km_inicial);

    // ── Agrupar partes por fecha (jornadas) ──
    const jornadas = {};
    partes.filter(p => Number(p.kms) > 0).forEach(p => {
      (jornadas[p.fecha] = jornadas[p.fecha] || []).push(p);
    });

    // ── Calcular desplazamientos por jornada ──
    let sumaDesplazamientos = 0;
    let diasSinCoord = 0;
    for (const lista of Object.values(jornadas)) {
      const kmDia = await calcularKmJornada(lista);
      if (kmDia === null) {
        // Fallback: suma directa de partes, redondeada a múltiplo de 10
        const sumaBruta = lista.reduce((acc, p) => acc + Number(p.kms || 0), 0);
        sumaDesplazamientos += Math.ceil(sumaBruta / 10) * 10;
        diasSinCoord++;
      } else {
        sumaDesplazamientos += kmDia;
      }
    }

    // ── Resultado final ──
    const nuevoKm = kmIncial + sumaDesplazamientos;

    if (Number(vehiculo.km) !== nuevoKm) {
      vehiculo.km = nuevoKm;
      vehiculo.km_actualizado = new Date().toISOString();
      await dbPut('vehiculos', vehiculo);
    }

    if (diasSinCoord > 0) {
      console.warn(`[recalcVehicleKms] ${matricula}: ${diasSinCoord} jornada(s) sin coordenadas -> suma directa redondeada.`);
    }

    return vehiculo;
  } catch (err) {
    console.error('[recalcVehicleKms]', err);
    showToast('Error al recalcular KMs: ' + err.message, 'error');
    return null;
  }
};

/** Recalcula TODA la flota (llamada puntual). */
window.recalcAllFleetKms = async function() {
  const vehiculos = await dbGetAll('vehiculos');
  for (const v of vehiculos) {
    if (v.matricula) await recalcVehicleKms(v.matricula);
  }                                              // ← este } CIERRA el for
  showToast('KMs de flota recalculados');
};                                               // ← y este la función
// ============================================================
// INFORME DIARIO DE FLOTA
// ============================================================

/**
 * Genera un informe de todos los vehículos y sus partes del día.
 * Devuelve objeto con resumen + detalle por vehículo.
 */
window.generateDailyReport = async function(dateStr = todayStr()) {
  try {
    // 1. Obtener TODOS los partes del día (una sola query por índice compuesto)
    const range = IDBKeyRange.bound(['', dateStr], ['\uffff', '\uffff'], false, false);
    const partesHoy = await dbGetByIndexRange('partesTrabajo', 'matricula_fecha', range);

    // 2. Obtener todos los vehículos
    const vehiculos = await dbGetAll('vehiculos');

    // 3. Agrupar partes por matrícula
    const porMatricula = {};
    partesHoy.forEach(p => {
      if (!porMatricula[p.matricula]) porMatricula[p.matricula] = [];
      porMatricula[p.matricula].push(p);
    });

    // 4. Construir detalle por vehículo
    const detalle = vehiculos.map(v => {
      const partes = (porMatricula[v.matricula] || [])
        .sort((a, b) => (a.hora_entrada || '').localeCompare(b.hora_entrada || ''));

      const primeraEntrada = partes[0]?.hora_entrada || '—';
      const ultimaSalida = partes[partes.length - 1]?.hora_salida || '—';
      const kmsRecorridos = partes.reduce((acc, p) => acc + Number(p.kms || 0), 0);

      return {
        matricula: v.matricula,
        modelo: `${v.marca || ''} ${v.modelo || ''}`.trim() || '—',
        cliente: partes[0]?.clienteNombre || '—',
        num_partes: partes.length,
        primera_entrada: primeraEntrada,
        ultima_salida: ultimaSalida,
        kms_recorridos: kmsRecorridos,
        tecnico: partes.map(p => p.empleadoNombre).filter(Boolean)[0] || '—',
        estado: partes.length ? '✅ Activo' : '⚪ Inactivo'
      };
    });

    // 5. Construir informe completo
    const informe = {
      fecha: dateStr,
      generado: new Date().toLocaleString('es-ES'),
      resumen: {
        total_partes: partesHoy.length,
        vehiculos_activos: Object.keys(porMatricula).length,
        vehiculos_flota: vehiculos.length,
        vehiculos_inactivos: vehiculos.length - Object.keys(porMatricula).length
      },
      detalle: detalle
    };

    // 6. Persistir informe (store 'informes')
    const idInforme = `inf_${dateStr}`;
    await dbPut('informes', { id: idInforme, ...informe });

    return informe;
  } catch(err) {
    console.error('[generateDailyReport]', err);
    showToast('Error al generar informe diario', 'error');
    return null;
  }
};

/**
 * Renderiza el informe diario en el dashboard.
 */
window.render_daily_report = async function(containerId = 'dailyReportContainer') {
  const informe = await generateDailyReport();
  if (!informe) return;

  const container = document.getElementById(containerId);
  if (!container) return;

  // Destruir gráfico previo (evita "Canvas is already in use")
  const existingChart = Chart.getChart('chartKmsDia');
  if (existingChart) existingChart.destroy();

  // Filtrar solo vehículos con KMs para el gráfico
  const datosGrafico = informe.detalle.filter(d => d.kms_recorridos > 0);

  container.innerHTML = `
    <div class="card" style="grid-column: 1/-1;">
      <h3>📋 Informe Diario — ${informe.fecha}</h3>
      <p style="color:#6b7280;font-size:0.85em;">Generado: ${informe.generado}</p>

      <div style="display:flex;gap:1rem;margin:1rem 0;flex-wrap:wrap;">
        <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 16px;">
          <div style="font-size:0.8em;color:#0369a1;">Partes hoy</div>
          <div style="font-size:1.5em;font-weight:bold;color:#0c4a6e;">${informe.resumen.total_partes}</div>
        </div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;">
          <div style="font-size:0.8em;color:#15803d;">Activos</div>
          <div style="font-size:1.5em;font-weight:bold;color:#166534;">${informe.resumen.vehiculos_activos}/${informe.resumen.vehiculos_flota}</div>
        </div>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;">
          <div style="font-size:0.8em;color:#b91c1c;">Inactivos</div>
          <div style="font-size:1.5em;font-weight:bold;color:#991b1b;">${informe.resumen.vehiculos_inactivos}</div>
        </div>
      </div>

      <canvas id="chartKmsDia" height="100"></canvas>

      <table style="width:100%;margin-top:1rem;border-collapse:collapse;font-size:0.9em;">
        <thead>
          <tr style="background:#f3f4f6;text-align:left;border-bottom:2px solid #e5e7eb;">
            <th style="padding:8px;">Matrícula</th>
            <th style="padding:8px;">Modelo</th>
            <th style="padding:8px;">Técnico</th>
            <th style="padding:8px;">Partes</th>
            <th style="padding:8px;">Entrada</th>
            <th style="padding:8px;">Salida</th>
            <th style="padding:8px;">KMs</th>
            <th style="padding:8px;">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${informe.detalle.map(d => `
            <tr style="border-bottom:1px solid #e5e7eb;">
              <td style="padding:8px;font-weight:bold;color:#2563eb;letter-spacing:0.5px;">${escapeHtml(d.matricula)}</td>
              <td style="padding:8px;">${escapeHtml(d.modelo)}</td>
              <td style="padding:8px;">${escapeHtml(d.tecnico)}</td>
              <td style="padding:8px;text-align:center;">${d.num_partes}</td>
              <td style="padding:8px;">${escapeHtml(d.primera_entrada)}</td>
              <td style="padding:8px;">${escapeHtml(d.ultima_salida)}</td>
              <td style="padding:8px;"><strong>${d.kms_recorridos}</strong></td>
              <td style="padding:8px;">${escapeHtml(d.estado)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="margin-top:1rem;display:flex;gap:0.5rem;">
        <button onclick="exportReportCSV()" class="btn btn-secondary btn-sm">Exportar CSV</button>
        <button onclick="window.print()" class="btn btn-primary btn-sm">Imprimir</button>
      </div>
    </div>
  `;

  // ── Gráfico de barras: KMs recorridos por vehículo (Chart.js directo) ──
  if (datosGrafico.length > 0) {
    setTimeout(() => {
      try {
        const ctx = document.getElementById('chartKmsDia');
        if (ctx) {
          new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
              labels: datosGrafico.map(d => d.matricula),
              datasets: [{
                label: 'KMs recorridos',
                data: datosGrafico.map(d => d.kms_recorridos),
                backgroundColor: 'rgba(37, 99, 235, 0.7)',
                borderColor: 'rgba(37, 99, 235, 1)',
                borderWidth: 1
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: true, position: 'top' },
                title: { display: true, text: 'KMs por vehículo — ' + informe.fecha }
              },
              scales: {
                y: { beginAtZero: true, title: { display: true, text: 'KMs' } }
              }
            }
          });
        }
      } catch(e) {
        console.warn('[Chart]', e.message);
      }
    }, 100);
  }
};

/**
 * Exporta el informe diario a CSV.
 */
window.exportReportCSV = async function(dateStr = todayStr()) {
  const informe = await generateDailyReport(dateStr);
  if (!informe) return;

  const headers = ['Matrícula','Modelo','Técnico','Partes','Entrada','Salida','KMs','Estado'];
  const rows = informe.detalle.map(d =>
    [d.matricula, d.modelo, d.tecnico, d.num_partes, d.primera_entrada, d.ultima_salida, d.kms_recorridos, d.estado]
  );

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `informe_flot_${dateStr}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Informe exportado como CSV');
};
/* ========================================
   Cadenas y Rutas (PASO B)
   ======================================== */

// --- Helpers de ID automático ---
async function generarIdCadena() {
  return window.db.nextId('CAD');
}

async function generarIdRuta() {
  return window.db.nextId('RUT');
}

// --- CRUD Cadenas ---
async function showCadenas() {
    const container = document.getElementById('main-content');
    container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `
        <h2>Cadenas y Rutas</h2>
        <p>Gestión de cadenas de revisión y rutas de supermercados</p>
    `;
    container.appendChild(header);

    // Sección Cadenas
    const secCadenas = document.createElement('div');
    secCadenas.className = 'card';
    secCadenas.innerHTML = `
        <div class="card-header">
            <h3>🔗 Cadenas</h3>
            <button class="btn btn-primary" id="btn-new-cadena">+ Nueva cadena</button>
        </div>
        <div id="cadenas-list"></div>
    `;
    container.appendChild(secCadenas);

    // Sección Rutas (se llena al expandir una cadena)
    const secRutas = document.createElement('div');
    secRutas.className = 'card';
    secRutas.innerHTML = `
        <div class="card-header">
            <h3>🛣️ Rutas</h3>
            <p id="rutas-info" style="color:var(--gray); font-size:0.9em;">Selecciona una cadena para ver sus rutas</p>
        </div>
        <div id="rutas-list"></div>
    `;
    container.appendChild(secRutas);

    // Renderizar cadenas
    await renderCadenasList();
}
// ==================== CADENAS: Render Corregido ====================
// ==================== CADENAS: RenderLista Final Corregido ====================
// ==================== CADENAS: Lista ====================
async function renderCadenasList() {
  const list = document.getElementById('cadenas-list');
  if (!list) return;

  const cadenas = await getAllCadenas();

  if (cadenas.length === 0) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-link"></i><p>No hay cadenas creadas.</p></div>';
    return;
  }

  // ✅ Usar la clase .card para que coincida con el resto de la app
  list.innerHTML = cadenas.map(c => `
    <div class="card chain-row" data-cadena-id="${c.id}">
      <div class="card-header">
        <strong>${escapeHtml(c.nombre)}</strong>
        <div class="chain-row-actions">
          <span class="badge badge-blue" id="ruta-count-${c.id}">0 rutas</span>
          <button type="button" class="btn btn-sm btn-outline" onclick="event.stopPropagation();render_rutas('${c.id}')"><i class="fas fa-route"></i> Rutas</button>
          <button type="button" class="btn btn-sm btn-danger" aria-label="Eliminar cadena ${escapeHtml(c.nombre)}" onclick="event.stopPropagation();deleteCadena('${c.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>
  `).join('');

  // Conteo de rutas por cadena
  for (const c of cadenas) {
    try {
      const rutas = await getRutasByCadena(c.id);
      const badge = document.getElementById('ruta-count-' + c.id);
      if (badge) badge.textContent = rutas.length + (rutas.length === 1 ? ' ruta' : ' rutas');
    } catch (e) {
      console.warn('Error contando rutas para', c.id, e);
    }
  }

  // Click en la tarjeta → ver rutas (SIEMPRE pasar string id)
  document.querySelectorAll('#cadenas-list .card').forEach(el => {
    el.addEventListener('click', async () => {
      el.style.boxShadow = 'var(--shadow-lg)';
      const id = String(el.dataset.cadenaId || '');   // ← dataset siempre devuelve string
      if (!id) return;
      await render_rutas(id);                          // ← directo, sin showRutasForCadena
    });
  });
}


// ═══════════════════════════════════════════════════════════
//  CADENAS — FORMULARIO + RUTAS + BORRADO
// ═══════════════════════════════════════════════════════════

async function showCadenaForm(editId = null) {
  const overlay = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  const footer = document.getElementById('modalFooter');

  let cadena = {};
  if (editId) {
    cadena = await getCadenaById(editId);
    if (!cadena) return;
  }

  title.textContent = editId ? 'Editar cadena' : 'Nueva cadena';
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px;">
      <div>
        <label style="display:block;font-size:13px;color:var(--gray);margin-bottom:4px;">Nombre *</label>
        <input id="form-cadena-nombre" type="text" class="input" value="${escapeHtml(cadena.nombre || '')}" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:15px;">
      </div>
      <div>
        <label style="display:block;font-size:13px;color:var(--gray);margin-bottom:4px;">Nota</label>
        <textarea id="form-cadena-nota" rows="3" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:15px;resize:vertical;">${escapeHtml(cadena.nota || '')}</textarea>
      </div>
    </div>`;
  footer.innerHTML = `
    <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" id="btn-save-cadena">${editId ? 'Actualizar' : 'Crear'}</button>`;

  overlay.classList.add('open');

  document.getElementById('btn-save-cadena').onclick = async () => {
    const nombre = document.getElementById('form-cadena-nombre').value.trim();
    if (!nombre) { document.getElementById('form-cadena-nombre').focus(); return; }

    const cadenaData = {
      ...(editId ? { id: editId } : { id: window.db.nextId('CAD') }),
      nombre,
      nota: document.getElementById('form-cadena-nota').value.trim(),
      createdAt: cadena.createdAt || new Date().toISOString()
    };

    await saveCadena(cadenaData);
    toast(editId ? 'Cadena actualizada' : 'Cadena creada');
    closeModal();
    renderCadenasList();
  };
}


// ==================== CADENAS: Borrar ====================

/**
 * deleteCadenaDb(id) → Promise<boolean>
 * Cascada: borra rutas y clientes de la cadena.
 */
async function deleteCadenaWithDependencies(id){
  const [clientes,rutas]=await Promise.all([dbGetAll('clientes'),dbGetAll('rutas')]);
  for(const cliente of clientes.filter(item=>String(item.cadenaId??item.cadenaid)===String(id))){
    await dbDelete('clientes',cliente.id);
  }
  for(const ruta of rutas.filter(item=>String(item.cadenaId??item.cadenaid)===String(id))){
    await dbDelete('rutas',ruta.id);
  }
  await dbDelete('cadenas',id);
}

window.deleteCadenaDb = async function (id) {
  if (!id || !window.confirm('¿Borrar esta cadena y sus rutas y clientes asociados?')) return false;
  try {
    await deleteCadenaWithDependencies(id);
    mostrarToast('Cadena y dependencias borradas', 'success');
    render_cadenas();
    return true;
  } catch (e) {
    console.error('deleteCadenaDb falló:', e.message);
    mostrarToast('No se pudo borrar la cadena', 'error');
    return false;
  }
};

async function deleteRuta(id, cadenaId) {
  const ruta = await getRutaById(id);
  if (!ruta) return;

  window.confirmDelete(ruta.nombre, async () => {
    await deleteRutaDb(id, true);
  });
}

// ==================== RUTAS: Formulario Modal ====================

/**
 * showRutaForm(editId, defaultCadenaId) → Promise<void>
 * Muestra modal con campos: nombre, cadenaid, frecuenciameses, orden, ultimorevision.
 */
async function showRutaForm(editId = null, defaultCadenaId = null) {
  const overlay = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  const footer = document.getElementById('modalFooter');

  let ruta = {};
  let cadenas = [];

  if (editId) {
    ruta = await getRutaById(editId);
    if (!ruta) return;
  }
  
  try {
    cadenas = await getAllCadenas();
  } catch (e) {
    console.error('Error cargando cadenas en showRutaForm:', e);
    cadenas = [];
  }

  const selectedCadenaId = defaultCadenaId ?? window.getCurrentCadenId() ?? localStorage.getItem('cadenaId') ?? (ruta.cadenaId ?? ruta.cadenaid ?? null);
  const selectedCadenaValue = selectedCadenaId ? String(selectedCadenaId) : '';
  if (selectedCadenaValue) window.setCurrentCadenId(selectedCadenaValue);

  const cadenasOptions = cadenas.map(c => {
    const cadenaId = ruta.cadenaId ?? ruta.cadenaid ?? selectedCadenaValue;
    const selected = String(cadenaId) === String(c.id) ? 'selected' : '';
    return `<option value="${c.id}" ${selected}>${escapeHtml(c.nombre)} (${c.id})</option>`;
  }).join('');

  // Normalizar valores para el formulario (versión vieja vs nueva)
  const rutaNombre = ruta.nombre || '';
  const rutaFrecuencia = ruta.frecuenciameses ?? ruta.frecuenciaMeses ?? 6;
  const rutaOrden = ruta.orden ?? 0;
  const rutaUltimaRevision = ruta.ultimorevision ?? ruta.ultimaRevision ?? null;
  const rutaUltimaDate = rutaUltimaRevision ? rutaUltimaRevision.slice(0, 10) : '';

  title.textContent = editId ? 'Editar ruta' : 'Nueva ruta';
  
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px;">
      <input id="form-ruta-id" type="hidden" value="${editId || ''}">
      <div>
        <label style="display:block;font-size:13px;color:var(--gray);margin-bottom:4px;">Nombre *</label>
        <input id="form-ruta-nombre" type="text" class="input" value="${escapeHtml(rutaNombre)}" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:15px;">
      </div>
      <div>
        <label style="display:block;font-size:13px;color:var(--gray);margin-bottom:4px;">Cadena *</label>
        <select id="form-ruta-cadena" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:15px;">
          <option value="">— Seleccionar —</option>
          ${cadenasOptions}
        </select>
      </div>
      <div style="display:flex;gap:16px;">
        <div style="flex:1;">
          <label style="display:block;font-size:13px;color:var(--gray);margin-bottom:4px;">Frecuencia (meses)</label>
          <input id="form-ruta-frecuencia" type="number" class="input only-num" min="1" value="${rutaFrecuencia}" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:15px;">
        </div>
        <div style="flex:1;">
          <label style="display:block;font-size:13px;color:var(--gray);margin-bottom:4px;">Orden</label>
          <input id="form-ruta-orden" type="number" class="input only-num" min="0" value="${rutaOrden}" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:15px;">
        </div>
      </div>
      <div>
        <label style="display:block;font-size:13px;color:var(--gray);margin-bottom:4px;">Última revisión</label>
        <input id="form-ruta-ultima" type="date" value="${rutaUltimaDate}" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:15px;">
      </div>
    </div>`;
  
  footer.innerHTML = `
    <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" id="btn-save-ruta">${editId ? 'Actualizar' : 'Crear'}</button>`;

  overlay.classList.add('open');

  document.getElementById('btn-save-ruta').onclick = async () => {
  const selectCadena = document.getElementById('form-ruta-cadena');
  if (selectCadena && selectCadena.value) {
    window.setCurrentCadenId(selectCadena.value);
    localStorage.setItem('cadenaId', String(selectCadena.value));
  }

  const exito = await window.saveRuta();
  if (exito) {
    closeModal();
    // Recargar vista si estamos en la pantalla de rutas de una cadena
    if (typeof render_rutas === 'function' && selectCadena && selectCadena.value) {
      render_rutas(selectCadena.value);
    }
  }
};
}


// ═══════════════════════════════════════════════════════════
//  WRAPPER PARA NAVEGACIÓN (render_<page>)
// ═══════════════════════════════════════════════════════════

// ==================== CADENAS: Render ====================
async function render_cadenas(main) {
  if (!main) main = document.querySelector('.main-content');
  main.innerHTML = `
    <div class="page-header">
      <h2><i class="fas fa-link"></i> Cadenas</h2>
      <button class="btn btn-primary" id="btn-new-cadena">+ Nueva cadena</button>
    </div>
    <div id="cadenas-list"></div>`;
  document.getElementById('btn-new-cadena').addEventListener('click', () => showCadenaForm());
  await renderCadenasList();
}

// ═══════════════════════════════════════════════════════════
//  REVISIONES PROGRAMADAS — PASO C
// ═══════════════════════════════════════════════════════════

async function render_revisionesProgramadas(main) {
  if (!main) main = document.getElementById('mainContent');

  main.innerHTML = `
    <div class="page-revisiones">
      <h2 class="page-revisiones-title"><i class="fas fa-calendar-check"></i> Revisiones Programadas</h2>
      <p class="page-revisiones-subtitle">Puertas agrupadas por cadena y ruta, con estado de última ronda.</p>
      <div id="revisiones-container" class="revisiones-container"></div>
    </div>`;

  const container = document.getElementById('revisiones-container');
  const cadenas = await getAllCadenas();

  if (cadenas.length === 0) {
    container.innerHTML = '<p style="padding:20px;text-align:center;color:var(--gray);">No hay cadenas. Crea una desde el menú "Cadenas".</p>';
    return;
  }

  for (const cadena of cadenas) {
    const rutas = await getRutasByCadena(cadena.id);
    const esDotics=cadena.nombre.trim().toLocaleUpperCase()==='DOTICS';
    const esHiperber=cadena.nombre.trim().toLocaleUpperCase()==='HIPERBER';
    if (rutas.length === 0 && !esDotics && !esHiperber) continue;

    const grupo = document.createElement('div');
    grupo.className = 'revision-grupo';
    grupo.dataset.cadenaId=String(cadena.id);

    grupo.innerHTML = `
      <div class="revision-cadena-header cadena-header-rev">
        <div>
          <strong>${escapeHtml(cadena.nombre)}</strong>
        </div>
        <div class="revision-cadena-meta">
          ${esDotics?'<button type="button" class="btn btn-sm btn-primary btn-dotics-visit">Formulario de revisión</button>':''}
          ${esHiperber?'<button type="button" class="btn btn-sm btn-primary btn-hiperber-review">Formulario de revisión</button>':''}
          ${window.isTechnician?.()?'':'<button type="button" class="btn btn-sm btn-primary btn-ver-cadena" data-cadena-id="'+escapeHtml(cadena.id)+'">Ver rutas</button>'}
          <span class="badge badge-info">${rutas.length} ruta${rutas.length>1?'s':''}</span>
        </div>
      </div>`;

    const revContent = document.createElement('div');
    revContent.className = 'revision-content';
    revContent.id = `rev-content-${cadena.id}`;

    for (const ruta of rutas) {
      const puertas = await getPuertasPorRuta(ruta.id);
      const puertasHtml = puertas.map(p => {
        const estado = getEstadoPuerta(p);
        const revisionCercana=p.proximaRevision&&((new Date(p.proximaRevision)-new Date())/86400000)<=30;
        return `
          <div class="revision-puerta-item">
            <div>
              <strong>${escapeHtml(p.clienteNombre)}</strong>
              <span class="revision-puerta-tipo">${escapeHtml(p.puertaTipo || '—')}</span>
              ${p.proximaRevision ? `<div class="revision-puerta-fecha">Próxima: ${formatDate(p.proximaRevision)}</div>` : ''}
            </div>
            <span class="badge ${estado.clase} badge-sm">${estado.texto}</span>
            ${window.isTechnician?.()?'<button type="button" class="btn btn-sm btn-primary btn-tech-review" data-puerta-id="'+escapeHtml(p.id)+'">Registrar revisión</button>':''}
            ${esDotics&&revisionCercana?'<button type="button" class="btn btn-sm btn-outline btn-dotics-door" data-puerta-id="'+escapeHtml(p.id)+'">Abrir ficha</button>':''}
          </div>`;
      }).join('');

      if (!puertasHtml) continue;

      const rutaGroup = document.createElement('div');
      rutaGroup.className = 'ruta-rev-group';

      const rutaHeader = document.createElement('div');
      rutaHeader.className = 'revision-ruta-header';
      rutaHeader.innerHTML = `
        <span>${escapeHtml(ruta.nombre)}
          ${ruta.frecuenciaMeses ? `<span class="revision-ruta-frecuencia">cada ${ruta.frecuenciaMeses} mes${ruta.frecuenciaMeses>1?'es':''}</span>` : ''}
        </span>
        <span class="badge ${ruta.proximaRevision ? (new Date(ruta.proximaRevision) < new Date() ? 'badge-red' : 'badge-green') : 'badge-yellow'} badge-sm">
          ${ruta.proximaRevision ? formatDate(ruta.proximaRevision) : 'Sin programar'}
        </span>
      `;
      if (!window.isTechnician?.()) rutaHeader.addEventListener('click', () => showRutasForCadena(cadena.id));
      rutaGroup.appendChild(rutaHeader);

      const rutaBody = document.createElement('div');
      rutaBody.className = 'revision-ruta-body';
      rutaBody.innerHTML = puertasHtml;
      rutaGroup.appendChild(rutaBody);
      revContent.appendChild(rutaGroup);
    }

    if(rutas.length===0){
      revContent.innerHTML='<p class="revision-empty-route">Aún no hay rutas para '+escapeHtml(cadena.nombre)+'.</p>';
    }

    grupo.appendChild(revContent);

    const cadenaHeader = grupo.querySelector('.cadena-header-rev');
    const verCadenaBtn = grupo.querySelector('.btn-ver-cadena');
    const doticsVisitBtn=grupo.querySelector('.btn-dotics-visit');
    const hiperberReviewBtn=grupo.querySelector('.btn-hiperber-review');
    doticsVisitBtn?.addEventListener('click',event=>{
      event.stopPropagation();
      window.openDoticsMaintenanceForm(cadena.id);
    });
    hiperberReviewBtn?.addEventListener('click',event=>{
      event.stopPropagation();
      window.openHiperberReviewForm(cadena.id);
    });
    grupo.querySelectorAll('.btn-dotics-door').forEach(button=>button.addEventListener('click',event=>{
      event.stopPropagation();
      window.openDoticsMaintenanceForm(cadena.id,button.dataset.puertaId);
    }));
    grupo.querySelectorAll('.btn-tech-review').forEach(button=>button.addEventListener('click',event=>{
      event.stopPropagation();
      abrirRevision(button.dataset.puertaId);
    }));
    cadenaHeader.addEventListener('click', (e) => {
      if (e.target.closest('.btn-ver-cadena,.btn-dotics-visit,.btn-hiperber-review')) return;
      revContent.style.display = revContent.style.display === 'none' ? 'block' : 'none';
    });
    verCadenaBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showRutasForCadena(cadena.id);
    });

    container.appendChild(grupo);
  }

  if (container.children.length === 0) {
    container.innerHTML = '<p style="padding:20px;text-align:center;color:var(--gray);">No hay rutas asignadas a ninguna cadena.</p>';
  }

  const clientesHistorial=await dbGetAll('clientes');
  const historialMount=document.createElement('section');
  historialMount.className='revision-history';
  historialMount.innerHTML=
    '<div class="revision-history-header"><div><h3>Historial de revisiones</h3><p>Consulta revisiones finalizadas y descarga su informe.</p></div></div>'+ 
    '<div class="revision-history-filters">'+
      '<div class="form-group"><label for="hist-rev-desde">Desde</label><input type="date" id="hist-rev-desde"></div>'+ 
      '<div class="form-group"><label for="hist-rev-hasta">Hasta</label><input type="date" id="hist-rev-hasta"></div>'+ 
      '<div class="form-group"><label for="hist-rev-cadena">Cadena</label><select id="hist-rev-cadena"><option value="">Todas</option>'+cadenas.map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.nombre)+'</option>').join('')+'</select></div>'+ 
      '<div class="form-group"><label for="hist-rev-cliente">Cliente / supermercado</label><select id="hist-rev-cliente"><option value="">Todos</option>'+clientesHistorial.map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.nombre)+'</option>').join('')+'</select></div>'+ 
      '<div class="form-group revision-history-search"><label for="hist-rev-buscar">Texto</label><input type="search" id="hist-rev-buscar" placeholder="Técnico, intervención o texto"></div>'+ 
      '<div class="revision-history-actions"><button type="button" class="btn btn-primary" id="hist-rev-aplicar"><i class="fas fa-search"></i> Buscar</button><button type="button" class="btn btn-outline" id="hist-rev-limpiar">Limpiar</button></div>'+ 
    '</div><div class="table-wrapper revision-history-table"><table><thead><tr><th>Fecha</th><th>Cadena</th><th>Cliente / supermercado</th><th>Técnico</th><th>Equipos</th><th>Resultado</th><th></th></tr></thead><tbody id="hist-rev-resultados"></tbody></table></div>';
  main.querySelector('.page-revisiones').appendChild(historialMount);
  document.getElementById('hist-rev-aplicar').addEventListener('click',()=>window.buscarHistorialRevisiones());
  document.getElementById('hist-rev-limpiar').addEventListener('click',()=>{
    ['hist-rev-desde','hist-rev-hasta','hist-rev-cadena','hist-rev-cliente','hist-rev-buscar'].forEach(id=>document.getElementById(id).value='');
    window.buscarHistorialRevisiones();
  });
  document.getElementById('hist-rev-buscar').addEventListener('keydown',event=>{if(event.key==='Enter')window.buscarHistorialRevisiones();});
  await window.buscarHistorialRevisiones();
}

function revisionHistoryMetadata(revision){
  let notes={};
  try{notes=JSON.parse(revision.notas||'{}');}catch(e){notes={texto:revision.notas||''};}
  const stores=Array.isArray(notes.supermercados)?notes.supermercados:[];
  const chainId=String(notes.cadenaId||revision.cadenaId||revision.cadenaid||'');
  const clientIds=[revision.clienteId,...stores.map(store=>store.id),...(revision.items||[]).map(item=>item.clienteId)].filter(Boolean).map(String);
  const clientNames=[...stores.map(store=>store.nombre),notes.clienteNombre,notes.cliente].filter(Boolean);
  const lineNames=(revision.items||[]).map(item=>item.clienteNombre).filter(Boolean);
  return{
    chainId,chainName:notes.cadena||'',clientIds,clientNames:[...new Set([...clientNames,...lineNames])],
    technician:notes.tecnicos||revision.tecnicoNombre||revision.tecnicoId||'—',
    contract:notes.contrato||'',intervention:notes.intervencion||'',notes,rawNotes:revision.notas||''
  };
}

window.buscarHistorialRevisiones=async function(){
  const body=document.getElementById('hist-rev-resultados');
  if(!body) return;
  const [revisiones,cadenas,clientes]=await Promise.all([dbGetAll('revisiones'),dbGetAll('cadenas'),dbGetAll('clientes')]);
  const chainNames=new Map(cadenas.map(chain=>[String(chain.id),chain.nombre]));
  const clientNames=new Map(clientes.map(client=>[String(client.id),client.nombre]));
  const desde=document.getElementById('hist-rev-desde').value;
  const hasta=document.getElementById('hist-rev-hasta').value;
  const cadenaFilter=document.getElementById('hist-rev-cadena').value;
  const clienteFilter=document.getElementById('hist-rev-cliente').value;
  const textFilter=document.getElementById('hist-rev-buscar').value.trim().toLocaleLowerCase();
  const filtered=revisiones.map(revision=>({revision,meta:revisionHistoryMetadata(revision)})).filter(({revision,meta})=>{
    const revisionDate=String(revision.fecha||'').slice(0,10);
    const chainName=meta.chainName||chainNames.get(meta.chainId)||'';
    const matchesDate=(!desde||revisionDate>=desde)&&(!hasta||revisionDate<=hasta);
    const matchesChain=!cadenaFilter||meta.chainId===cadenaFilter;
    const matchesClient=!clienteFilter||meta.clientIds.includes(clienteFilter)||String(revision.clienteId||'')===clienteFilter;
    const searchable=[revision.id,chainName,meta.clientNames.join(' '),meta.technician,meta.contract,meta.intervention,meta.rawNotes,...(revision.items||[]).map(item=>[item.concepto,item.hallazgoTexto,item.correctivoTexto].join(' '))].join(' ').toLocaleLowerCase();
    return matchesDate&&matchesChain&&matchesClient&&(!textFilter||searchable.includes(textFilter));
  }).sort((a,b)=>String(b.revision.fecha||'').localeCompare(String(a.revision.fecha||'')));
  if(!filtered.length){
    body.innerHTML='<tr><td colspan="7" class="revision-history-empty">No hay revisiones que coincidan con los filtros.</td></tr>';
    return;
  }
  body.innerHTML=filtered.map(({revision,meta})=>{
    const chainName=meta.chainName||chainNames.get(meta.chainId)||'—';
    const names=meta.clientNames.length?meta.clientNames.join(', '):(revision.clienteId?clientNames.get(String(revision.clienteId)):'—');
    const rawResult=revision.estadoTrasRevision||((revision.items||[]).some(item=>item.resultadoEstado==='x')?'Fuera de servicio':'Operativa');
    const result=String(rawResult).replace(/_/g,' ');
    const resultLabel=result.charAt(0).toLocaleUpperCase()+result.slice(1);
    return '<tr><td data-label="Fecha">'+escapeHtml(formatDate(revision.fecha))+'</td><td data-label="Cadena">'+escapeHtml(chainName)+'</td><td data-label="Cliente / supermercado">'+escapeHtml(names||'—')+'</td><td data-label="Técnico">'+escapeHtml(meta.technician)+'</td><td data-label="Equipos">'+(revision.items||[]).length+'</td><td data-label="Resultado">'+escapeHtml(resultLabel)+'</td><td data-label="PDF"><button type="button" class="btn btn-primary btn-sm btn-hist-rev-pdf" data-revision-id="'+escapeHtml(revision.id)+'" aria-label="Descargar PDF de revisión"><i class="fas fa-file-pdf"></i> PDF</button></td></tr>';
  }).join('');
  body.querySelectorAll('.btn-hist-rev-pdf').forEach(button=>button.addEventListener('click',()=>window.generatePDF_revision(button.dataset.revisionId)));
};

// ═══════════════════════════════════════════════════════════
//  HELPERS PARA REVISIONES PROGRAMADAS
// ═══════════════════════════════════════════════════════════

async function getPuertasPorRuta(rutaId) {
  const clientes = await dbGetByIndex('clientes', 'rutaId', rutaId);
  const puertasFiltradas = [];

  for (const cli of clientes) {
    const cliPuertas = await dbGetByIndex('puertas', 'clienteId', cli.id);
    for (const p of cliPuertas) {
      puertasFiltradas.push({
        ...p,
        clienteNombre: cli.nombre
      });
    }
  }

  return puertasFiltradas.sort((a, b) => (a.clienteNombre || '').localeCompare(b.clienteNombre || ''));
}

function getEstadoPuerta(puerta) {
  if (!puerta.proximaRevision) {
    return { texto: 'Sin programar', clase: 'badge-yellow' };
  }

  const proxima = new Date(puerta.proximaRevision);
  const hoy = new Date();
  const diffDias = Math.ceil((proxima - hoy) / (1000 * 60 * 60 * 24));

  if (diffDias < 0) {
    return { texto: `Vencida ${Math.abs(diffDias)}d`, clase: 'badge-red' };
  } else if (diffDias <= 30) {
    return { texto: `En ${diffDias}d`, clase: 'badge-yellow' };
  } else {
    return { texto: 'OK', clase: 'badge-green' };
  }
}

window.openHiperberReviewForm=async function(chainId){
  const chain=await getCadenaById(chainId);
  if(!chain) return showToast('No se encontró la cadena HIPERBER','error');
  const [clients,routes]=await Promise.all([dbGetAll('clientes'),getRutasByCadena(chain.id)]);
  const routeIds=new Set(routes.map(route=>String(route.id)));
  const supermarkets=clients.filter(client=>
    String(client.cadenaId??client.cadenaid??'')===String(chain.id)||
    String(client.padreId??client.padreid??'')===String(chain.id)||
    routeIds.has(String(client.rutaId??client.rutaid??''))
  );
  const stores=[];
  for(const client of supermarkets){
    const doors=await dbGetByIndex('puertas','clienteId',client.id);
    stores.push({
      clienteId:client.id,nombre:client.nombre,
      puertas:doors.length?doors.map(door=>({id:door.id,nombre:door.nombre||door.tipoPuerta||door.tipo||'Puerta',tipo:door.tipoPuerta||door.tipo||'',hallazgo:null,hallazgoTexto:'',hallazgoFotos:[],correctivo:null,correctivoTexto:'',resultado:null})):
        [{id:null,nombre:'',tipo:'',hallazgo:null,hallazgoTexto:'',hallazgoFotos:[],correctivo:null,correctivoTexto:'',resultado:null,nueva:true}]
    });
  }
  window.__hiperberReviewDraft={id:window.db.nextId('REV'),chainId:String(chain.id),chainName:chain.nombre,stores};
  const form='<div class="hiperber-form">'+
    '<div class="form-group hiperber-date"><label for="hiperber-review-date">Fecha de revisión</label><input id="hiperber-review-date" type="date" value="'+new Date().toISOString().slice(0,10)+'"></div>'+ 
    '<div id="hiperber-stores" class="hiperber-stores"></div>'+ 
  '</div>';
  const footer='<button type="button" class="btn btn-primary" onclick="closeModal()">Cancelar</button>'+ 
    '<button type="button" class="btn btn-primary" onclick="saveHiperberReviewForm()"><i class="fas fa-save"></i> Guardar revisión</button>';
  openModal('Revisión · '+chain.nombre,form,footer);
  renderHiperberStores();
};

function renderHiperberStores(){
  const draft=window.__hiperberReviewDraft;
  const container=document.getElementById('hiperber-stores');
  if(!draft||!container) return;
  if(!draft.stores.length){
    container.innerHTML='<div class="empty-state"><p>No hay supermercados asignados a HIPERBER. Asigna clientes a la cadena para completar el formulario.</p></div>';
    return;
  }
  container.innerHTML=draft.stores.map((store,storeIndex)=>
    '<section class="hiperber-store"><h3>'+escapeHtml(store.nombre)+'</h3>'+ 
      '<div class="table-wrapper hiperber-table-wrapper"><table class="hiperber-checklist"><thead><tr><th>Puerta</th><th>HALLAZGO</th><th>CORRECTIVO</th><th>RESULTADO</th></tr></thead><tbody>'+ 
        store.puertas.map((door,doorIndex)=>'<tr><td data-label="Puerta"><input class="hiperber-door-name" type="text" aria-label="Puerta de '+escapeHtml(store.nombre)+'" placeholder="'+(door.nueva?'Añade una puerta':'Nombre de la puerta')+'" value="'+escapeHtml(door.nombre)+'" oninput="updateHiperberDoor('+storeIndex+','+doorIndex+',\'nombre\',this.value)"><small>'+escapeHtml(door.tipo||'')+'</small></td>'+ 
          hiperberDecisionCell(storeIndex,doorIndex,door,'hallazgo',[['ok','OK'],['x','X']])+ 
          hiperberDecisionCell(storeIndex,doorIndex,door,'correctivo',[['ok','OK'],['hecho','Hecho'],['x','X']])+ 
          hiperberDecisionCell(storeIndex,doorIndex,door,'resultado',[['ok','OK'],['x','X']])+'</tr>').join('')+
      '</tbody></table></div><button type="button" class="btn btn-primary btn-sm hiperber-add-door" onclick="addHiperberDoor('+storeIndex+')"><i class="fas fa-plus"></i> Añadir puerta</button></section>'
  ).join('');
}

function hiperberDecisionCell(storeIndex,doorIndex,door,field,options){
  const state=door[field]||'';
  let detail='';
  if(field==='hallazgo'){
    const photos=(door.hallazgoFotos||[]).map((photo,index)=>'<span class="hiperber-photo-name">Foto '+(index+1)+' <button type="button" aria-label="Quitar foto" onclick="removeHiperberFindingPhoto('+storeIndex+','+doorIndex+','+index+')">×</button></span>').join('');
    detail='<div class="hiperber-decision-detail" data-detail-for="hallazgo" '+(state==='x'?'':'hidden')+'><textarea rows="2" aria-label="Describir hallazgo" placeholder="Describe el desperfecto" oninput="updateHiperberDoor('+storeIndex+','+doorIndex+',\'hallazgoTexto\',this.value)">'+escapeHtml(door.hallazgoTexto)+'</textarea><button type="button" class="btn btn-primary btn-sm" onclick="openHiperberFindingCamera('+storeIndex+','+doorIndex+')"><i class="fas fa-camera"></i> Hacer foto</button><div class="hiperber-photo-list">'+photos+'</div></div>';
  }else if(field==='correctivo'){
    const detailLabel=state==='hecho'?'Trabajo realizado':'Acción pendiente';
    detail='<div class="hiperber-decision-detail" data-detail-for="correctivo" '+(['hecho','x'].includes(state)?'':'hidden')+'><textarea rows="2" aria-label="'+detailLabel+'" placeholder="'+detailLabel+'" oninput="updateHiperberDoor('+storeIndex+','+doorIndex+',\'correctivoTexto\',this.value)">'+escapeHtml(door.correctivoTexto)+'</textarea></div>';
  }
  return '<td data-label="'+field.toUpperCase()+'"><div class="hiperber-choice-group" role="radiogroup" aria-label="'+field.toUpperCase()+' · '+escapeHtml(door.nombre||'puerta nueva')+'">'+
    options.map(([value,label])=>'<label class="hiperber-choice '+(value==='ok'||value==='hecho'?'hiperber-choice-yes':'hiperber-choice-no')+'"><input type="radio" name="hiperber-'+storeIndex+'-'+doorIndex+'-'+field+'" value="'+value+'" '+(state===value?'checked':'')+' onchange="updateHiperberDoorDecision('+storeIndex+','+doorIndex+',\''+field+'\',this.value,this)"><span>'+label+'</span></label>').join('')+
    '</div>'+detail+'</td>';
}

window.updateHiperberDoor=function(storeIndex,doorIndex,field,value){
  const door=window.__hiperberReviewDraft?.stores[storeIndex]?.puertas[doorIndex];
  if(door) door[field]=value;
};

window.updateHiperberDoorDecision=function(storeIndex,doorIndex,field,value,input){
  const door=window.__hiperberReviewDraft?.stores[storeIndex]?.puertas[doorIndex];
  if(!door) return;
  const row=input.closest('tr');
  door[field]=value;
  if(field==='hallazgo'){
    if(value==='ok'){
      door.hallazgoTexto='';door.hallazgoFotos=[];door.correctivo='ok';door.correctivoTexto='';door.resultado='ok';
    }else{
      door.correctivo=null;door.correctivoTexto='';door.resultado=null;
    }
  }else if(field==='correctivo'&&value==='hecho'){
    door.resultado='ok';
  }
  row.querySelectorAll('.hiperber-choice-group').forEach(group=>{
    const groupField=group.querySelector('input')?.name.split('-').pop();
    const selected=door[groupField];
    group.querySelectorAll('input[type="radio"]').forEach(radio=>radio.checked=radio.value===selected);
    const detail=row.querySelector('[data-detail-for="'+groupField+'"]');
    if(detail) detail.hidden=groupField==='hallazgo'?selected!=='x':groupField==='correctivo'?!['hecho','x'].includes(selected):true;
    if(groupField==='correctivo'){
      const textarea=detail?.querySelector('textarea');
      if(textarea){
        const detailLabel=selected==='hecho'?'Trabajo realizado':'Acción pendiente';
        textarea.setAttribute('aria-label',detailLabel);
        textarea.placeholder=selected==='hecho'?'Describe la reparación realizada':'Describe el correctivo pendiente';
      }
    }
  });
};

window.openHiperberFindingCamera=function(storeIndex,doorIndex){
  const input=document.createElement('input');
  input.className='hiperber-camera-input';
  input.type='file';
  input.accept='image/*';
  input.capture='environment';
  input.addEventListener('change',async()=>{
    await window.addHiperberFindingPhoto(storeIndex,doorIndex,input.files?.[0]);
    input.remove();
  },{once:true});
  input.addEventListener('cancel',()=>input.remove(),{once:true});
  document.body.appendChild(input);
  input.click();
};

window.addHiperberFindingPhoto=async function(storeIndex,doorIndex,file){
  const door=window.__hiperberReviewDraft?.stores[storeIndex]?.puertas[doorIndex];
  if(!file||!door) return;
  try{
    door.hallazgoFotos=door.hallazgoFotos||[];
    door.hallazgoFotos.push(await compressDoticsPhoto(file));
    renderHiperberStores();
  }catch(error){showToast(error.message||'No se pudo procesar la foto','error');}
};

window.removeHiperberFindingPhoto=function(storeIndex,doorIndex,photoIndex){
  const door=window.__hiperberReviewDraft?.stores[storeIndex]?.puertas[doorIndex];
  door?.hallazgoFotos?.splice(photoIndex,1);
  renderHiperberStores();
};

window.addHiperberDoor=function(storeIndex){
  const store=window.__hiperberReviewDraft?.stores[storeIndex];
  if(!store) return;
  store.puertas.push({id:null,nombre:'',tipo:'',hallazgo:null,correctivo:null,resultado:null,nueva:true});
  renderHiperberStores();
};

async function downloadRevisionPDFAfterSave(revisionId){
  try{
    await window.generatePDF_revision(revisionId);
  }catch(error){
    console.error('No se pudo generar el PDF de la revisión guardada:',error);
    showToast('Revisión guardada, pero no se pudo generar el PDF','error');
  }
}

window.saveHiperberReviewForm=async function(){
  const draft=window.__hiperberReviewDraft;
  if(!draft) return;
  const fecha=document.getElementById('hiperber-review-date').value;
  if(!fecha) return showToast('Selecciona la fecha de revisión','error');
  const stores=draft.stores.map(store=>({...store,puertas:store.puertas.filter(door=>door.id||door.nombre.trim())}));
  if(stores.some(store=>store.puertas.some(door=>door.nueva&&!door.nombre.trim()))){
    showToast('Escribe el nombre de cada puerta nueva','error');
    return;
  }
  const doors=stores.flatMap(store=>store.puertas.map(door=>({...door,clienteId:store.clienteId,clienteNombre:store.nombre})));
  if(!doors.length){
    showToast('Añade al menos una puerta para revisar','error');
    return;
  }
  if(doors.some(door=>!door.hallazgo||!door.correctivo||!door.resultado)){
    showToast('Completa Hallazgo, Correctivo y Resultado en cada puerta','error');
    return;
  }
  if(doors.some(door=>door.hallazgo==='x'&&!door.hallazgoTexto.trim())){
    showToast('Describe el hallazgo marcado con X','error');
    return;
  }
  if(doors.some(door=>door.correctivo==='hecho'&&!door.correctivoTexto.trim())){
    showToast('Describe el correctivo realizado','error');
    return;
  }
  const items=doors.map(door=>({
    concepto:door.clienteNombre+' · '+door.nombre,clienteId:door.clienteId,clienteNombre:door.clienteNombre,puertaId:door.id,tipoPuerta:door.tipo,
    hallazgo:door.hallazgo==='ok'?'OK':'X',hallazgoEstado:door.hallazgo,hallazgoTexto:door.hallazgoTexto,hallazgoFotos:door.hallazgoFotos||[],
    correctivo:door.correctivo==='hecho'?door.correctivoTexto:door.correctivo==='x'?'X':'OK',correctivoEstado:door.correctivo,correctivoTexto:door.correctivoTexto,
    resultado:door.resultado==='ok'?'OK':'X',resultadoEstado:door.resultado
  }));
  const notas=JSON.stringify({form:'HIPERBER_REVISION_V1',cadenaId:draft.chainId,cadena:draft.chainName,supermercados:stores.map(store=>({id:store.clienteId,nombre:store.nombre}))});
  try{
    await dbAdd('revisiones',{
      id:draft.id,puertaId:null,clienteId:null,fecha,tecnicoId:window.authState?.employee?.id||null,items,
      hallazgos:doors.filter(door=>door.hallazgo==='x').map(door=>door.clienteNombre+' · '+door.nombre+': '+door.hallazgoTexto).join(' | '),
      correctivo:doors.filter(door=>door.correctivo==='hecho').map(door=>door.clienteNombre+' · '+door.nombre+': '+door.correctivoTexto).join(' | '),
      estadoTrasRevision:doors.some(door=>door.resultado==='x')?'fuera_servicio':'operativa',notas,createdAt:new Date().toISOString()
    });
    window.__hiperberReviewDraft=null;
    closeModal();
    showToast('Revisión HIPERBER guardada');
    await downloadRevisionPDFAfterSave(draft.id);
  }catch(error){
    showToast('No se pudo guardar la revisión: '+error.message,'error');
  }
};

window.openDoticsMaintenanceForm = async function(chainId, doorId=null){
  let chain=await getCadenaById(chainId);
  if(!chain){
    const client=await dbGet('clientes',chainId);
    if(client?.nombre?.trim().toLocaleUpperCase()==='DOTICS') chain={id:client.id,nombre:client.nombre};
  }
  if(!chain) return showToast('No se encontró la cadena DOTICS','error');
  const door=doorId ? await dbGet('puertas',doorId) : null;
  const client=door?.clienteId ? await dbGet('clientes',door.clienteId) : null;
  const employees=window.isTechnician?.()
    ? (window.authState.employee ? [window.authState.employee] : [])
    : await dbGetAll('empleados');
  const id=window.db.nextId('REV');
  const productTypes=['SECCIONAL','RAPIDA','RAPIDA PLEGABLE','BASCULANTE','CORREDERA','CORREDERA CRISTAL'];
  const doorType=String(door?.tipoPuerta||door?.tipo||'').trim().toLocaleUpperCase();
  window.__doticsVisitDraft={
    id,chainId:String(chain.id),chainName:chain.nombre,doorId:door?.id||null,productTypes,
    lines:[{
      tipoProducto:productTypes.includes(doorType)?doorType:'',
      denominacionCliente:door?.nombre||client?.nombre||'',
      numeroSerie:door?.numeroSerie||door?.serie||door?.serial||'',
      estado:'',observaciones:'',fotos:[]
    }]
  };
  const today=new Date().toISOString().slice(0,10);
  const form='<div class="dotics-form">'+
    '<div class="dotics-form-intro"><strong>'+escapeHtml(chain.nombre)+'</strong><span>Informe visita de mantenimiento</span></div>'+
    '<div class="dotics-form-grid">'+
      '<div class="form-group"><label for="dotics-contract">N.º contrato mantenimiento</label><input id="dotics-contract" type="text" autocomplete="off"></div>'+
      '<div class="form-group"><label for="dotics-intervention">N.º intervención</label><input id="dotics-intervention" type="text" autocomplete="off" placeholder="Escribe el número de intervención"></div>'+
      '<div class="form-group"><label for="dotics-technicians">Técnico/s</label><input id="dotics-technicians" type="text" list="dotics-employees" placeholder="Nombre/s del técnico" '+(window.isTechnician?.()?'value="'+escapeHtml(window.authState.employee?.nombre||'')+'" readonly':'')+'><datalist id="dotics-employees">'+employees.map(e=>'<option value="'+escapeHtml(e.nombre)+'">').join('')+'</datalist></div>'+
      '<div class="form-group"><label for="dotics-date">Fecha</label><input id="dotics-date" type="date" value="'+today+'"></div>'+
    '</div>'+
    '<div class="dotics-lines-heading"><div><h3>Equipos revisados</h3><p>Indica un estado por equipo; añade foto si está operativo o no se debe usar.</p></div><button type="button" class="btn btn-outline" onclick="addDoticsVisitLine()"><i class="fas fa-plus"></i> Añadir equipo</button></div>'+
    '<div id="dotics-visit-lines" class="dotics-line-list"></div>'+
    '<div class="form-group dotics-general-notes"><label for="dotics-notes">Observaciones generales</label><textarea id="dotics-notes" rows="3" placeholder="Observaciones de la visita"></textarea></div>'+
  '</div>';
  const footer='<button type="button" class="btn btn-primary" onclick="closeModal()">Cancelar</button>'+ 
    '<button type="button" class="btn btn-primary" onclick="saveDoticsMaintenanceForm()"><i class="fas fa-save"></i> Guardar informe</button>';
  openModal('Informe visita de mantenimiento',form,footer);
  renderDoticsVisitLines();
};

function renderDoticsVisitLines(){
  const draft=window.__doticsVisitDraft;
  const container=document.getElementById('dotics-visit-lines');
  if(!draft||!container) return;
  container.innerHTML=draft.lines.map((line,index)=>{
    const photos=(line.fotos||[]).map((photo,photoIndex)=>
      '<div class="dotics-photo-preview"><img src="'+photo+'" alt="Foto del equipo '+(index+1)+'"><button type="button" class="btn btn-danger btn-icon" aria-label="Quitar foto" onclick="removeDoticsVisitPhoto('+index+','+photoIndex+')"><i class="fas fa-trash"></i></button></div>'
    ).join('');
    const photoField=line.estado==='operativo'||line.estado==='no_usar'
      ? '<div class="dotics-photo-field"><label>Fotos del equipo</label><div class="dotics-photo-actions">'+
          '<button type="button" class="btn btn-primary btn-sm" onclick="openDoticsCamera('+index+')"><i class="fas fa-camera"></i> Hacer foto</button>'+ 
          '<button type="button" class="btn btn-primary btn-sm" onclick="selectDoticsPhotoFile('+index+')"><i class="fas fa-image"></i> Seleccionar archivo</button>'+ 
          '<input id="dotics-camera-'+index+'" class="dotics-file-input" type="file" accept="image/*" capture="environment" onchange="addDoticsVisitPhoto('+index+',this)">'+
          '<input id="dotics-file-'+index+'" class="dotics-file-input" type="file" accept="image/*" onchange="addDoticsVisitPhoto('+index+',this)">'+
        '</div><div class="dotics-photo-previews">'+photos+'</div></div>'
      : '';
    return '<section class="dotics-line-card"><div class="dotics-line-title"><h4>Equipo '+(index+1)+'</h4>'+(draft.lines.length>1?'<button type="button" class="btn btn-outline btn-icon" aria-label="Eliminar equipo '+(index+1)+'" onclick="removeDoticsVisitLine('+index+')"><i class="fas fa-trash"></i></button>':'')+'</div>'+
      '<div class="dotics-line-fields">'+
        '<div class="form-group"><label for="dotics-type-'+index+'">Tipo producto</label><select id="dotics-type-'+index+'" onchange="updateDoticsVisitLine('+index+',\'tipoProducto\',this.value)"><option value="">— Seleccionar —</option>'+draft.productTypes.map(type=>'<option value="'+type+'" '+(line.tipoProducto===type?'selected':'')+'>'+type+'</option>').join('')+'</select></div>'+
        '<div class="form-group"><label for="dotics-name-'+index+'">Denominación cliente</label><input id="dotics-name-'+index+'" type="text" value="'+escapeHtml(line.denominacionCliente)+'" oninput="updateDoticsVisitLine('+index+',\'denominacionCliente\',this.value)"></div>'+
        '<div class="form-group"><label for="dotics-serial-'+index+'">N.º de serie</label><input id="dotics-serial-'+index+'" type="text" value="'+escapeHtml(line.numeroSerie)+'" oninput="updateDoticsVisitLine('+index+',\'numeroSerie\',this.value)"></div>'+
        '<fieldset class="dotics-state-field"><legend>Estado del equipo</legend><div class="dotics-state-options">'+
          [['bueno','Bueno','Bueno'],['operativo','Operativo','Oper.'],['no_usar','No usar','No usar']].map(([value,label,compact])=>'<label class="dotics-state-option dotics-state-'+value+'"><input type="radio" name="dotics-state-'+index+'" value="'+value+'" aria-label="'+label+'" '+(line.estado===value?'checked':'')+' onchange="updateDoticsVisitState('+index+',this.value)"><span class="dotics-state-label-full">'+label+'</span><span class="dotics-state-label-compact" aria-hidden="true">'+compact+'</span></label>').join('')+
        '</div></fieldset>'+
        '<div class="form-group dotics-observations"><label for="dotics-observation-'+index+'">Observaciones</label><textarea id="dotics-observation-'+index+'" rows="2" oninput="updateDoticsVisitLine('+index+',\'observaciones\',this.value)">'+escapeHtml(line.observaciones)+'</textarea></div>'+photoField+
      '</div></section>';
  }).join('');
}

window.updateDoticsVisitLine=function(index,field,value){
  const line=window.__doticsVisitDraft?.lines[index];
  if(!line) return;
  line[field]=value;
  if(field==='estado') renderDoticsVisitLines();
};

window.updateDoticsVisitState=function(index,value){
  window.updateDoticsVisitLine(index,'estado',value);
  if(value==='no_usar') window.openDoticsCamera(index);
};

window.openDoticsCamera=function(index){
  document.getElementById('dotics-camera-'+index)?.click();
};

window.selectDoticsPhotoFile=function(index){
  document.getElementById('dotics-file-'+index)?.click();
};

window.addDoticsVisitLine=function(){
  window.__doticsVisitDraft?.lines.push({tipoProducto:'',denominacionCliente:'',numeroSerie:'',estado:'',observaciones:'',fotos:[]});
  renderDoticsVisitLines();
};

window.removeDoticsVisitLine=function(index){
  window.__doticsVisitDraft?.lines.splice(index,1);
  renderDoticsVisitLines();
};

async function compressDoticsPhoto(file){
  const source=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(file);
  });
  const image=await new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=reject;
    img.src=source;
  });
  let scale=Math.min(1,1280/Math.max(image.width,image.height));
  let quality=.68;
  let result='';
  for(let attempt=0;attempt<8;attempt++){
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.width*scale));
    canvas.height=Math.max(1,Math.round(image.height*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    result=canvas.toDataURL('image/jpeg',quality);
    if(result.length*.75<=160*1024) return result;
    if(quality>.48) quality-=.08;
    else scale*=.82;
  }
  throw new Error('La foto supera el tamaño admitido; prueba con otra imagen.');
}

window.addDoticsVisitPhoto=async function(index,input){
  const file=input.files?.[0];
  const line=window.__doticsVisitDraft?.lines[index];
  if(!file||!line) return;
  try{
    line.fotos=[await compressDoticsPhoto(file)];
    renderDoticsVisitLines();
  }catch(error){
    showToast(error.message||'No se pudo procesar la foto','error');
    input.value='';
  }
};

window.removeDoticsVisitPhoto=function(index,photoIndex){
  const line=window.__doticsVisitDraft?.lines[index];
  if(!line) return;
  line.fotos.splice(photoIndex,1);
  renderDoticsVisitLines();
};

window.saveDoticsMaintenanceForm=async function(){
  const draft=window.__doticsVisitDraft;
  if(!draft) return;
  const date=document.getElementById('dotics-date').value;
  const contract=document.getElementById('dotics-contract').value.trim();
  const intervention=document.getElementById('dotics-intervention').value.trim();
  const technicians=document.getElementById('dotics-technicians').value.trim();
  const generalNotes=document.getElementById('dotics-notes').value.trim();
  if(!date||!intervention||!technicians){
    showToast('Completa la fecha, el número de intervención y el técnico.','error');
    return;
  }
  const lines=draft.lines.filter(line=>line.tipoProducto||line.denominacionCliente||line.numeroSerie);
  if(!lines.length||lines.some(line=>!line.estado)){
    showToast('Añade al menos un equipo e indica su estado.','error');
    return;
  }
  const employees=window.isTechnician?.()
    ? (window.authState.employee ? [window.authState.employee] : [])
    : await dbGetAll('empleados');
  const lead=employees.find(employee=>technicians.toLocaleLowerCase().includes(employee.nombre.toLocaleLowerCase()));
  const items=lines.map(line=>({
    concepto:[line.tipoProducto,line.denominacionCliente,line.numeroSerie].filter(Boolean).join(' · '),
    tipoProducto:line.tipoProducto,denominacionCliente:line.denominacionCliente,numeroSerie:line.numeroSerie,
    estado:line.estado==='bueno'?'ok':line.estado==='operativo'?'desgaste':'correctivo',
    estadoEquipo:line.estado,hallazgo:line.observaciones,observaciones:line.observaciones,fotos:line.fotos
  }));
  const notes=JSON.stringify({form:'DOTICS_VISITA_V1',cadenaId:draft.chainId,cliente:draft.chainName,contrato:contract,intervencion:intervention,tecnicos:technicians,observaciones:generalNotes});
  try{
    await dbAdd('revisiones',{
      id:draft.id,puertaId:draft.doorId,clienteId:null,fecha:date,tecnicoId:lead?.id||null,items,
      hallazgos:items.filter(item=>item.estadoEquipo!=='bueno'&&item.hallazgo).map(item=>item.concepto+': '+item.hallazgo).join(' | '),
      correctivo:'',estadoTrasRevision:items.some(item=>item.estadoEquipo==='no_usar')?'fuera_servicio':'operativa',notas:notes,createdAt:new Date().toISOString()
    });
    if(draft.doorId && window.isTechnician?.()){
      const door=await dbGet('puertas',draft.doorId);
      const { error } = await window.supabaseDB.rpc('update_door_revision_schedule', {
        p_id: String(draft.doorId), p_last_revision: date,
        p_state: null
      });
      if(error) throw error;
    }else if(draft.doorId){
      const door=await dbGet('puertas',draft.doorId);
      if(door){
        const client=door.clienteId ? await dbGet('clientes',door.clienteId) : null;
        const routeId=client?.rutaId??client?.rutaid;
        const route=routeId ? await dbGet('rutas',routeId) : null;
        const frequency=Number(route?.frecuenciaMeses??route?.frecuenciameses)||6;
        await dbPut('puertas',{...door,ultimaRevision:date,proximaRevision:calcularProximaRevision(date,frequency)});
      }
    }
    window.__doticsVisitDraft=null;
    closeModal();
    showToast('Informe DOTICS guardado');
    await downloadRevisionPDFAfterSave(draft.id);
  }catch(error){
    showToast('No se pudo guardar el informe: '+error.message,'error');
  }
};
// ── Bloque final de pages.js ──
// IMPORTANTE: Object.assign para fusionar (no sobreescribir) lo que db.js ya expuso
// (render_informesKms, verMensual, verDetalleVehiculo, generarPDF expuestos desde pages_informesKms.js)

// ── Bloque final de pages.js ──
// Object.assign para fusionar sin sobreescribir lo expuesto por otros archivos

window.pages = window.pages || {};
Object.assign(window.pages, {
  // Dashboard
  render_dashboard: window.render_dashboard,

  // Partes
  showParteForm: window.showParteForm,
  saveParte: window.saveParte,
  renderPartes: window.renderPartes,

  // Clientes
  showClienteForm: window.showClienteForm,
  saveCliente: window.saveCliente,

  // Vehículos
  showVehiculoForm: window.showVehiculoForm,
  saveVehiculo: window.saveVehiculo,

  // Artículos / Almacén
  showArticuloForm: window.showArticuloForm,
  saveArticulo: window.saveArticulo,

  // Presupuestos
  showPresupuestoForm: window.showPresupuestoForm,
  savePresupuesto: window.savePresupuesto,

  // Cadenas / Rutas
  renderCadenasList: window.renderCadenasList,
  showCadenaForm: window.showCadenaForm,
  showRutasForCadena: window.showRutasForCadena,
  deleteCadena: window.deleteCadena
});
// ============================================
// CADENAS - CRUD completo
// ============================================

// ==================== CADENAS: Formulario y Guardado ====================

/**
 * showCadenaForm(editId) → Promise<void>
 * Muestra modal para crear/editar cadena con campos: nombre, descripcion.
 */
async function showCadenaForm(editId = null) {
  const overlay = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  const footer = document.getElementById('modalFooter');

  let cadena = {};
  if (editId) {
    cadena = await getCadenaById(editId);
    if (!cadena) return;
  }

  title.textContent = editId ? 'Editar cadena' : 'Nueva cadena';
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px;">
      <input id="form-cadena-id" type="hidden" value="${editId || ''}">
      <div>
        <label style="display:block;font-size:13px;color:var(--gray);margin-bottom:4px;">Nombre *</label>
        <input id="form-cadena-nombre" type="text" class="input" value="${escapeHtml(cadena.nombre || '')}" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:15px;">
      </div>
      <div>
        <label style="display:block;font-size:13px;color:var(--gray);margin-bottom:4px;">Descripción</label>
        <textarea id="form-cadena-descripcion" class="input" rows="3" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:15px;">${escapeHtml(cadena.descripcion || cadena.nota || '')}</textarea>
      </div>
    </div>`;
  
  footer.innerHTML = `
    <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" id="btn-save-cadena">${editId ? 'Actualizar' : 'Crear'}</button>`;

  overlay.classList.add('open');

  document.getElementById('btn-save-cadena').onclick = async () => {
    const idExistente = document.getElementById('form-cadena-id')?.value || null;
    const nombre = document.getElementById('form-cadena-nombre')?.value.trim();
    const descripcion = document.getElementById('form-cadena-descripcion')?.value.trim();

    if (!nombre) {
      mostrarToast('El nombre es obligatorio', 'error');
      return;
    }

    const ahora = new Date().toISOString();
    const cadenaData = {
      id: idExistente || window.db.nextId('CAD'),
      nombre,
      descripcion,
      updatedat: ahora
    };

    if (!idExistente) cadenaData.createdat = ahora;
    try {
      await dbPut('cadenas', { ...cadenaData });
    } catch (e) {
      console.error('showCadenaForm falló:', e);
      mostrarToast('Error guardando la cadena', 'error');
      return;
    }

    closeModal();
    mostrarToast(idExistente ? 'Cadena actualizada' : 'Cadena creada', 'success');
    render_cadenas();
  };
}

/**
 * getCadenaById(id) → Promise<Cadena | null>
 */
async function getCadenaById(id) {
  try {
    const data=await dbGet('cadenas',id);
    return data ? normalizarCadena(data) : null;
  } catch (e) {
    console.warn('getCadenaById falló:', e.message);
    return null;
  }
}

/**
 * normalizarCadena(c) → Cadena
 */
function normalizarCadena(c) {
  if (!c) return null;
  return {
    id: c.id,
    nombre: c.nombre || '',
    descripcion: c.descripcion || c.nota || '',
    createdat: c.createdat || c.created_at || new Date().toISOString(),
    updatedat: c.updatedat || new Date().toISOString()
  };
}

function renderizarFormularioCadena(cadena) {
  const main = document.querySelector('.main-content');
  const titulo = cadena ? 'Editar Cadena' : 'Nueva Cadena';
  const valorNombre = cadena ? cadena.nombre : '';
  const valorDescripcion = cadena ? cadena.descripcion || '' : '';
  
  main.innerHTML = `
    <div class="page-header">
      <h2>${titulo}</h2>
      <button onclick="navigateTo('cadenas')" class="btn-secondary">← Volver</button>
    </div>
    <form id="form-cadena" class="form-container">
      <input type="hidden" id="cd_id" value="${cadena ? cadena.id : ''}">
      
      <label for="cd_nombre">Nombre de la cadena *</label>
      <input type="text" id="cd_nombre" required value="${valorNombre}" placeholder="Ej: Cadena Norte">
      
      <label for="cd_descripcion">Descripción</label>
      <textarea id="cd_descripcion" rows="3" placeholder="Opcional">${valorDescripcion}</textarea>
      
      <div class="form-actions">
        <button type="submit" class="btn-primary">Guardar</button>
        <button type="button" onclick="navigateTo('cadenas')" class="btn-secondary">Cancelar</button>
      </div>
    </form>
  `;
    const form = document.getElementById('form-cadena');
  form.onsubmit = null;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    saveCadena();
  });
}

window.saveCadena = async function() {
  const idRaw = document.getElementById('cd_id').value;
  const nombre = document.getElementById('cd_nombre').value.trim();
  const descripcion = document.getElementById('cd_descripcion').value.trim();

  if (!nombre) { alert('El nombre es obligatorio'); return; }

  try {
    const updatedat=new Date().toISOString();
    const data={id:idRaw||window.db.nextId('CAD'),nombre,descripcion,updatedat};
    if(!idRaw) data.createdat=updatedat;
    await dbPut('cadenas',data);
    
    toast('Cadena guardada');
    navigateTo('cadenas');
  } catch (err) {
    console.error('Error en saveCadena:', err);
    alert('Error al guardar: ' + (err.message || JSON.stringify(err)));
  }
};

// ==================== RUTAS: Acceso a datos ====================

/**
 * getAllRutas(cadenaid) → Promise<Array<Ruta>>
 * Si cadenaid se pasa, filtra por cadena.
 */
async function getAllRutas(cadenaid) {
  const all=await dbGetAll('rutas');
  return all
    .filter(r=>!cadenaid||String(r.cadenaid??r.cadenaId)===String(cadenaid))
    .map(normalizarRuta)
    .sort((a,b)=>(a.orden||0)-(b.orden||0));
}

/**
 * getRutaById(id) → Promise<Ruta | null>
 */
async function getRutaById(id) {
  try {
    const data=await dbGet('rutas',id);
    return data ? normalizarRuta(data) : null;
  } catch (e) {
    console.warn('getRutaById falló:', e.message);
    return null;
  }
}

/**
 * normalizarRuta(r) → Ruta
 * Asegura campos consistentes independientemente del origen.
 */
function normalizarRuta(r) {
  if (!r) return null;
  return {
    id: r.id,
    nombre: r.nombre || '',
    cadenaid: r.cadenaid || null,
    frecuenciameses: r.frecuenciameses || 6,
    orden: r.orden ?? 0,
    ultimorevision: r.ultimorevision || null,
    proximarevision: r.proximarevision || calcularProximaRevision(r.ultimorevision, r.frecuenciameses),
    createdat: r.createdat || new Date().toISOString(),
    updatedat: r.updatedat || new Date().toISOString()
  };
}

// ==================== RUTAS: Borrar ====================

/**
 * deleteRutaDb(id) → Promise<boolean>
 * Borra ruta en Supabase + IndexedDB. Cascada: limpia rutaid en clientes.
 */
window.deleteRutaDb = async function (id, confirmed=false) {
  if (!id) return false;

  if(!confirmed){
    if(window.confirmDelete){
      return new Promise(resolve=>window.confirmDelete('la ruta seleccionada',async()=>resolve(await window.deleteRutaDb(id,true))));
    }
    if(!window.confirm('¿Borrar esta ruta? Los clientes asociados perderán la referencia a la ruta.')) return false;
  }

  try {
    const ruta=await dbGet('rutas',id);
    const clientes=await dbGetAll('clientes');
    for(const cliente of clientes.filter(item=>String(item.rutaid??item.rutaId)===String(id))){
      await dbPut('clientes',{...cliente,rutaid:null,rutaId:null});
    }
    await dbDelete('rutas',id);
    mostrarToast('Ruta borrada', 'success');
    const currentChain=localStorage.getItem('cadenaId')||ruta?.cadenaid||ruta?.cadenaId;
    if(currentChain&&typeof render_rutas==='function') render_rutas(currentChain);
  } catch (e) {
    console.error('deleteRutaDb falló:', e);
    mostrarToast('No se pudo borrar la ruta', 'error');
    return false;
  }

  return true;
};

// ==================== RUTAS: Render de Página ====================

/**
 * render_rutas(cadenaid) → Promise<void>
 * Renderiza lista de rutas de una cadena en .main-content.
 */
// ==================== RUTAS: Render Corregido ====================
// ==================== RUTAS: Render Final Corregido ====================
// ==================== RUTAS: Render ====================
async function render_rutas(mainOrChainId, requestedChainId) {
  const main=mainOrChainId?.nodeType===1 ? mainOrChainId : document.getElementById('mainContent');
  let cadenaId=requestedChainId || (mainOrChainId?.nodeType===1 ? localStorage.getItem('cadenaId') : mainOrChainId);
  if(cadenaId && typeof cadenaId==='object') cadenaId=cadenaId.target?.value??cadenaId.value??null;
  if (cadenaId) {
    cadenaId = String(cadenaId);
    window.setCurrentCadenId(cadenaId);
    localStorage.setItem('cadenaId', cadenaId);
  } else {
    cadenaId = window.getCurrentCadenId() || localStorage.getItem('cadenaId') || null;
  }
  
  if (!cadenaId) {
    main.innerHTML = '<p style="text-align:center;color:var(--gray);margin-top:40px;">Selecciona una cadena primero.</p>';
    return;
  }
  // Leer nombre de la cadena para el título
  let cadenaNombre = '';
  try {
    const cadena=await getCadenaById(cadenaId);
    if(cadena) cadenaNombre=cadena.nombre;
  } catch (e) {
    console.warn('No se pudo leer nombre cadena', cadenaId);
  }

  const esDotics=cadenaNombre.trim().toLocaleUpperCase()==='DOTICS';
  const esHiperber=cadenaNombre.trim().toLocaleUpperCase()==='HIPERBER';
  main.innerHTML = `
    <div class="page-header">
      <div class="route-page-heading">
        <nav class="breadcrumbs" aria-label="Ruta de navegación">
          <button type="button" class="breadcrumb-link" onclick="navigateTo('revisionesProgramadas')">Revisiones Programadas</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" class="breadcrumb-link" onclick="volverARevisionesCadena('${escapeHtml(cadenaId)}')">${escapeHtml(cadenaNombre)}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span aria-current="page">Rutas</span>
        </nav>
        <h2>🛣️ Rutas</h2>
      </div>
      <div class="header-actions">
        ${esDotics?'<button class="btn btn-outline" id="btn-dotics-visit"><i class="fas fa-clipboard-check"></i> Formulario de revisión</button>':''}
        ${esHiperber?'<button class="btn btn-outline" id="btn-hiperber-review"><i class="fas fa-clipboard-check"></i> Formulario de revisión</button>':''}
        <button class="btn btn-primary" id="btn-nueva-ruta">+ Nueva Ruta</button>
      </div>
    </div>
    <div id="rutas-lista">
      <div class="spinner" style="margin:40px auto;text-align:center;">Cargando rutas...</div>
    </div>`;

  document.getElementById('btn-dotics-visit')?.addEventListener('click',()=>window.openDoticsMaintenanceForm(cadenaId));
  document.getElementById('btn-hiperber-review')?.addEventListener('click',()=>window.openHiperberReviewForm(cadenaId));

  let rutas = [];
  try {
    rutas = await getAllRutas(cadenaId);
  } catch (e) {
    console.error('render_rutas getAllRutas falló:', e);
  }

  if (!rutas.length) {
    document.getElementById('rutas-lista').innerHTML = `
      <div class="empty-state">
        <i class="fas fa-route"></i>
        <p>No hay rutas para esta cadena.</p>
        <button class="btn btn-primary" id="btn-primera-ruta" style="margin-top:16px;">+ Crear primera ruta</button>
      </div>`;
    document.getElementById('btn-primera-ruta').onclick = () => showRutaForm(null, cadenaId);
    return;
  }

  const html = rutas.map(ruta => {
    const rutaNormalizada = {
      ...ruta,
      proximaRevision: ruta.proximaRevision ?? ruta.proximarevision ?? null,
      ultimaRevision: ruta.ultimaRevision ?? ruta.ultimorevision ?? null,
      cadenaId: ruta.cadenaId ?? ruta.cadenaid ?? null,
      frecuenciaMeses: ruta.frecuenciaMeses ?? ruta.frecuenciameses ?? 6
    };
    const proxima = rutaNormalizada.proximaRevision ? new Date(rutaNormalizada.proximaRevision).toLocaleDateString('es-ES') : '—';
    const ultima = rutaNormalizada.ultimaRevision ? new Date(rutaNormalizada.ultimaRevision).toLocaleDateString('es-ES') : '—';

    let dias = '—';
    let badgeClass = '';
    if (rutaNormalizada.proximaRevision) {
      const diff = new Date(rutaNormalizada.proximaRevision).getTime() - Date.now();
      dias = Math.ceil(diff / (1000 * 60 * 60 * 24));
      if (dias < 0) badgeClass = 'badge-red';
      else if (dias <= 30) badgeClass = 'badge-yellow';
      else badgeClass = 'badge-green';
    }

    return `
      <div class="card">
        <div class="card-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <strong>${escapeHtml(ruta.nombre)}</strong>
            <span class="badge ${badgeClass}" style="font-size:11px;">${dias !== '—' ? dias + ' días' : dias}</span>
          </div>
          <span style="color:var(--text-muted);font-size:13px;">Orden: ${ruta.orden}</span>
        </div>
        <div class="card-body" style="padding:12px 20px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;font-size:13px;color:var(--text-muted);">
            <div><strong>Última revisión:</strong> ${ultima}</div>
            <div><strong>Próxima:</strong> ${proxima}</div>
            <div><strong>Frecuencia:</strong> ${rutaNormalizada.frecuenciaMeses} meses</div>
          </div>
        </div>
        <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;">
          <button class="btn btn-sm btn-outline" onclick="showRutaForm('${ruta.id}')">✏️ Editar</button>
          <button class="btn btn-sm btn-outline" onclick="render_clientes_ruta('${ruta.id}')">👥 Clientes</button>
          <button type="button" class="btn btn-sm btn-danger" onclick="deleteRuta('${escapeHtml(ruta.id)}','${escapeHtml(cadenaId)}')"><i class="fas fa-trash"></i> Borrar</button>
        </div>
      </div>`;
  }).join('');

  document.getElementById('rutas-lista').innerHTML = html;

  // ✅ Botón Nueva Ruta
  document.getElementById('btn-nueva-ruta').onclick = () => showRutaForm(null, cadenaId);
}


/**
 * render_clientes_ruta(rutaid) → carga y muestra clientes de esta ruta
 */
async function render_clientes_ruta(rutaid) {
  if (rutaid && typeof rutaid === 'object') {
    rutaid = rutaid.target?.value ?? rutaid.value ?? null;
  }

  let clientes = [];
  let ruta = null;
  try {
    ruta=await getRutaById(rutaid);
    const todos = await dbGetAll('clientes');
    clientes = todos.filter(c => String(c.rutaId??c.rutaid) === String(rutaid));
  } catch (e) {
    console.error('render_clientes_ruta falló:', e);
  }

  const cadenaId = String(ruta?.cadenaId??ruta?.cadenaid??localStorage.getItem('cadenaId')??'');
  if(cadenaId) localStorage.setItem('cadenaId',cadenaId);
  const cadena=cadenaId ? await getCadenaById(cadenaId) : null;
  const main = document.querySelector('.main-content');
  main.innerHTML = `
    <div class="page-header">
      <div class="route-page-heading">
        <nav class="breadcrumbs" aria-label="Ruta de navegación">
          <button type="button" class="breadcrumb-link" onclick="navigateTo('revisionesProgramadas')">Revisiones Programadas</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" class="breadcrumb-link" onclick="volverARevisionesCadena('${escapeHtml(cadenaId)}')">${escapeHtml(cadena?.nombre||'Cadena')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" class="breadcrumb-link" onclick="render_rutas('${escapeHtml(cadenaId)}')">Rutas</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span aria-current="page">Clientes</span>
        </nav>
        <h2>👥 Clientes de ${escapeHtml(ruta?.nombre||'esta ruta')}</h2>
      </div>
    </div>
    <div id="clientes-ruta-lista">
      ${clientes.length ? clientes.map(c => `
        <div class="card" style="margin-bottom:10px;">
          <div class="card-body" style="padding:14px 18px;">
            <strong>${escapeHtml(c.nombre)}</strong>
            <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">
              📞 ${escapeHtml(c.telefono || 'Sin teléfono')}
              &nbsp;·&nbsp; ✉️ ${escapeHtml(c.email || 'Sin email')}
            </div>
          </div>
        </div>
      `).join('') : '<p style="text-align:center;color:var(--gray);margin-top:40px;">No hay clientes en esta ruta.</p>'}
    </div>`;

}

window.volverARevisionesCadena=async function(chainId){
  await navigateTo('revisionesProgramadas');
  const group=document.querySelector('.revision-grupo[data-cadena-id="'+CSS.escape(String(chainId))+'"]');
  if(!group) return;
  const content=group.querySelector('.revision-content');
  if(content) content.style.display='block';
  group.scrollIntoView({behavior:'smooth',block:'start'});
};
/**
 * Compatibilidad: la app usa una única convención para rutas.
 * Tanto el código nuevo como el legado llamarán a esta función.
 */
function calcularProximaRevision(ultimaRevisionISO, meses = 6) {
  return calcularProximaRevisionRuta(ultimaRevisionISO, meses);
}
window.calcularProximaRevision = calcularProximaRevision;

window.showRutasForCadena = function(cadenaId) {
  // Normalizar por si llega elemento/evento desde el router
  if (cadenaId && typeof cadenaId === 'object') {
    cadenaId = cadenaId.target?.value ?? cadenaId.value ?? null;
  }
  if (!cadenaId) { console.warn('showRutasForCadena: sin id'); return; }
  const normalizedId = String(cadenaId);
  window.setCurrentCadenId(normalizedId);
  localStorage.setItem('cadenaId', normalizedId);
  navigateTo('rutas', normalizedId);
};
// ============================================
// FUNCIONES CRUD CADENAS - AÑADIR AL FINAL
// ============================================


window.deleteCadena = async function(cadenaId) {
  if (!confirm('¿Eliminar esta cadena? Se borrarán también todas sus rutas.')) return;
  try {
    await deleteCadenaWithDependencies(cadenaId);
    toast('Cadena eliminada');
    navigateTo('cadenas');
  } catch (err) {
    console.error('Error al eliminar cadena:', err);
    alert('Error al eliminar: ' + err.message);
  }
};
// ✅ Puente con el router: navigateTo('cadenas') → render_cadenas

// ==================== CADENAS: Render Corregido ====================

/** getCadenas() → Promise<Array<Cadena>>
 * Supabase primero, IndexedDB como fallback. Normaliza a descripcion.
 */
async function getCadenas() {
  const all=await dbGetAll('cadenas');
  return all.map(normalizarCadena).sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''));
}
/**
 * render_cadenas() → Promise<void>
 * Renderiza lista de cadenas en .main-content.
 * Actualizado: usa descripcion (no nota), abre render_rutas al hacer clic.
 */
// ==================== CADENAS: Render Final Corregido ====================
async function render_cadenas(main) {
  if (!main) main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="chains-page">
      <div class="page-header">
        <h2><i class="fas fa-link" style="color:var(--primary);"></i> Cadenas</h2>
        <button class="btn btn-primary" id="btn-new-cadena">+ Nueva cadena</button>
      </div>
      <div id="cadenas-list" class="chains-list"></div>
    </div>`;
  document.getElementById('btn-new-cadena').addEventListener('click', () => showCadenaForm());
  await renderCadenasList();
}