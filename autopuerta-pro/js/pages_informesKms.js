// ── pages_informesKms.js — Informes de KMs (v2: buscador + vista mensual + gráfico) ──




async function render_informesKms(container) {
  container.innerHTML = `
    <div class="page-header">
      <h2><i class="fas fa-chart-pie"></i> Informes de Kilometraje</h2>
    </div>

    <!-- Buscador -->
    <div class="search-bar" style="margin-bottom:15px;">
      <input type="text" id="searchVehiculo" placeholder="🔍 Buscar por matrícula o vehículo..." 
             style="max-width:400px; padding:8px 12px; border:1px solid var(--border); border-radius:6px; width:100%;">
    </div>

    <!-- Filtros -->
    <div class="filter-bar">
      <div class="filter-group">
        <label>Desde:</label>
        <input type="date" id="filterDesde">
      </div>
      <div class="filter-group">
        <label>Hasta:</label>
        <input type="date" id="filterHasta">
      </div>
      <div class="filter-group">
        <label>Estado:</label>
        <select id="filterEstado">
          <option value="todos">Todos</option>
          <option value="completado">Completados</option>
          <option value="pendiente">Pendientes</option>
        </select>
      </div>
      <button class="btn btn-primary btn-sm" id="btnFiltrar">
        <i class="fas fa-filter"></i> Filtrar
      </button>
      <button class="btn btn-outline btn-sm" id="btnLimpiar">
        <i class="fas fa-times"></i> Limpiar
      </button>
    </div>

    <!-- Resumen por vehículo -->
    <div class="card" style="margin-top:20px;">
      <div class="card-header">
        <h3>KMs por Vehículo</h3>
        <button class="btn btn-primary btn-sm" id="btnPDF">
          <i class="fas fa-file-pdf"></i> Generar PDF
        </button>
      </div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-hover" id="tablaKms">
            <thead>
              <tr>
                <th>Matrícula</th>
                <th>Vehículo</th>
                <th>KM Inicial</th>
                <th>KM Suma (periodo)</th>
                <th>KM Total</th>
                <th>Partes</th>
                <th>Mensual</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="tbodyKms"></tbody>
          </table>
        </div>
        <div id="kmsVacio" class="empty-state" style="display:none;">
          <i class="fas fa-info-circle"></i>
          <h3>Sin datos</h3>
          <p>No hay partes de trabajo en el periodo seleccionado.</p>
        </div>
      </div>
    </div>

    <!-- Vista mensual con gráfico -->
    <div class="card" id="vistaMensual" style="display:none; margin-top:20px;">
      <div class="card-header">
        <h3 id="mensualTitulo">KMs Diarios — <span id="mensualMatricula"></span></h3>
        <button class="btn btn-outline btn-sm" id="btnCerrarMensual">
          <i class="fas fa-times"></i> Cerrar
        </button>
      </div>
      <div class="card-body">
        <div style="height:300px; margin-bottom:20px;">
          <canvas id="graficoKms"></canvas>
        </div>
        <div class="table-responsive">
          <table class="table table-sm" id="tablaMensual">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Partes</th>
                <th>KMs del día</th>
                <th>Acumulado</th>
              </tr>
            </thead>
            <tbody id="tbodyMensual"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Detalle por vehículo -->
    <div class="card" id="detalleVehiculo" style="display:none; margin-top:20px;">
      <div class="card-header">
        <h3 id="detalleTitulo">Detalle — <span id="detalleMatricula"></span></h3>
        <button class="btn btn-outline btn-sm" id="btnCerrarDetalle">
          <i class="fas fa-times"></i> Cerrar
        </button>
      </div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-sm" id="tablaDetalle">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Descripción</th>
                <th>KMs</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody id="tbodyDetalle"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // ── Asignar eventos ──
  document.getElementById('btnFiltrar').addEventListener('click', () => cargarTablaKms());
  document.getElementById('btnLimpiar').addEventListener('click', limpiarFiltros);
  document.getElementById('btnPDF').addEventListener('click', generarPDF);
  document.getElementById('btnCerrarDetalle').addEventListener('click', () => {
    document.getElementById('detalleVehiculo').style.display = 'none';
  });
  document.getElementById('btnCerrarMensual').addEventListener('click', () => {
    document.getElementById('vistaMensual').style.display = 'none';
  });

  // Buscador instantáneo
  document.getElementById('searchVehiculo').addEventListener('input', () => cargarTablaKms());

  // Doble clic en fila para ver detalle
  document.getElementById('tbodyKms')?.addEventListener('dblclick', async (e) => {
    const row = e.target.closest('tr');
    if (!row) return;
    const matricula = row.dataset.matricula;
    if (matricula) await verDetalleVehiculo(matricula);
  });

  // Cargar tabla por defecto (hoy)
  const hoy = window.utils?.todayStr?.() || new Date().toISOString().slice(0,10);
  document.getElementById('filterDesde').value = hoy;
  document.getElementById('filterHasta').value = hoy;
  cargarTablaKms();
}

// ── Cargar tabla resumen de KMs ──
async function cargarTablaKms() {
  const desde = document.getElementById('filterDesde')?.value || window.utils?.todayStr?.() || new Date().toISOString().slice(0,10);
  const hasta = document.getElementById('filterHasta')?.value || window.utils?.todayStr?.() || new Date().toISOString().slice(0,10);
  const estado = document.getElementById('filterEstado')?.value || 'todos';
  const busqueda = document.getElementById('searchVehiculo')?.value?.toLowerCase().trim() || '';

  // Obtener partes filtrados
  let partes = await window.db.dbGetAll('partesTrabajo');
  partes = partes.filter(p => {
    return p.fecha >= desde && p.fecha <= hasta &&
           (estado === 'todos' || p.estado === estado);
  });

  // Obtener vehículos
  const vehiculos = await window.db.dbGetAll('vehiculos');

  // FIX BUSCADOR: asignar el resultado del filter a una variable
  let listaVeh = vehiculos;
  if (busqueda) {
    listaVeh = vehiculos.filter(v => {
      return (v.matricula || '').toLowerCase().includes(busqueda) ||
             (v.marca && v.marca.toLowerCase().includes(busqueda)) ||
             (v.modelo && v.modelo.toLowerCase().includes(busqueda));
    });
  }

  // Agrupar KMs por matrícula
  const totales = {};
  const conteo = {};
  for (const p of partes) {
    if (!totales[p.matricula]) { totales[p.matricula] = 0; conteo[p.matricula] = 0; }
    totales[p.matricula] += Number(p.kms) || 0;
    conteo[p.matricula] += 1;
  }

  // Construir filas
  const tbody = document.getElementById('tbodyKms');
  const vacio = document.getElementById('kmsVacio');
  tbody.innerHTML = '';

  const vehiculosConDatos = listaVeh.filter(v => totales[v.matricula] !== undefined);

  if (vehiculosConDatos.length === 0) {
    vacio.style.display = 'block';
    tbody.closest('table').style.display = 'none';
    return;
  }

  vacio.style.display = 'none';
  tbody.closest('table').style.display = '';

  for (const v of vehiculosConDatos) {
    const kmInicial = v.km_inicial || 0;
    const kmSuma = totales[v.matricula] || 0;
    const kmTotal = kmInicial + kmSuma;

    const tr = document.createElement('tr');
    tr.dataset.matricula = v.matricula;
    tr.innerHTML = `
      <td><strong>${escapeHtml(v.matricula)}</strong></td>
      <td>${escapeHtml(v.marca)} ${escapeHtml(v.modelo)}</td>
      <td>${kmInicial.toLocaleString('es-ES')}</td>
      <td style="color:var(--success);font-weight:bold">+${kmSuma.toLocaleString('es-ES')}</td>
      <td><strong>${kmTotal.toLocaleString('es-ES')}</strong></td>
      <td>${conteo[v.matricula]}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="verMensual('${v.matricula}')">
          <i class="fas fa-calendar-alt"></i> Mensual
        </button>
      </td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="verDetalleVehiculo('${v.matricula}')">
          <i class="fas fa-search"></i> Ver
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

// ── Ver vista mensual con gráfico (CORREGIDA) ──
let graficoKmsInstance = null;

async function verMensual(matricula) {
  const desde = document.getElementById('filterDesde')?.value || window.utils?.todayStr?.() || new Date().toISOString().slice(0,10);
  const hasta = document.getElementById('filterHasta')?.value || window.utils?.todayStr?.() || new Date().toISOString().slice(0,10);

  // Obtener partes del vehículo en el periodo
  const partes = (await window.db.dbGetAll('partesTrabajo'))
    .filter(p => p.matricula === matricula && p.fecha >= desde && p.fecha <= hasta);

  const vehiculos = await window.db.dbGetAll('vehiculos');
  const veh = vehiculos.find(v => v.matricula === matricula);
  if (!veh) return;

  const kmInicial = Number(veh.km_inicial) || 0;

  // Agrupar KMs por día
  const porDia = {};
  const partesPorDia = {};
  for (const p of partes) {
    if (!porDia[p.fecha]) { porDia[p.fecha] = 0; partesPorDia[p.fecha] = 0; }
    porDia[p.fecha] += Number(p.kms) || 0;
    partesPorDia[p.fecha] += 1;
  }

  // Ordenar fechas
  const fechasOrdenadas = Object.keys(porDia).sort();
  const labels = fechasOrdenadas;
  const datosKms = fechasOrdenadas.map(f => porDia[f]);

  // Acumulado CORRECTO: km_inicial + suma progresiva de los días
  const datosAcumulado = [];
  let acumulado = kmInicial;
  for (const f of fechasOrdenadas) {
    acumulado += porDia[f];          // solo se suma lo del día
    datosAcumulado.push(acumulado);  // valor total real del vehículo ese día
  }

  // Actualizar título
  document.getElementById('mensualMatricula').textContent = veh.matricula;
  document.getElementById('mensualTitulo').innerHTML =
    `KMs Diarios — <span>${escapeHtml(veh.marca)} ${escapeHtml(veh.modelo)} (${escapeHtml(veh.matricula)})</span>`;

  // ── Gráfico de barras ──
  const canvas = document.getElementById('graficoKms');
  const ctx = canvas.getContext('2d');

  if (graficoKmsInstance) {
    graficoKmsInstance.destroy();
  }

  graficoKmsInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'KMs del día',
          data: datosKms,
          backgroundColor: 'rgba(96, 165, 250, 0.7)',
          borderColor: 'rgba(96, 165, 250, 1)',
          borderWidth: 1,
          yAxisID: 'y'
        },
        {
          label: 'Acumulado',
          data: datosAcumulado,
          type: 'line',
          borderColor: 'rgba(52, 211, 153, 1)',
          backgroundColor: 'rgba(52, 211, 153, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.dataset.label + ': ' + context.parsed.y.toLocaleString('es-ES') + ' km';
            }
          }
        }
      },
      scales: {
        y: {
          type: 'linear', display: true, position: 'left',
          title: { display: true, text: 'KMs del día' }
        },
        y1: {
          type: 'linear', display: true, position: 'right',
          title: { display: true, text: 'Acumulado' },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });

  // ── Tabla diaria (ACUMULADO CORREGIDO) ──
  const tbody = document.getElementById('tbodyMensual');
  tbody.innerHTML = '';

  fechasOrdenadas.forEach((f, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${f}</td>
      <td>${partesPorDia[f]}</td>
      <td style="color:var(--success);font-weight:bold">${porDia[f].toLocaleString('es-ES')}</td>
      <td><strong>${datosAcumulado[i].toLocaleString('es-ES')}</strong></td>
    `;
    tbody.appendChild(tr);
  });

  // Mostrar vista
  document.getElementById('vistaMensual').style.display = 'block';
  document.getElementById('vistaMensual').scrollIntoView({ behavior: 'smooth' });
}

// ── Ver detalle de un vehículo ──
async function verDetalleVehiculo(matricula) {
  const desde = document.getElementById('filterDesde')?.value || window.utils?.todayStr?.() || new Date().toISOString().slice(0,10);
  const hasta = document.getElementById('filterHasta')?.value || window.utils?.todayStr?.() || new Date().toISOString().slice(0,10);

  const partes = (await window.db.dbGetAll('partesTrabajo'))
    .filter(p => p.matricula === matricula && p.fecha >= desde && p.fecha <= hasta);

  const vehiculos = await window.db.dbGetAll('vehiculos');
  const veh = vehiculos.find(v => v.matricula === matricula);

  if (!veh) return;

  const container = document.getElementById('detalleVehiculo');
  const tbody = document.getElementById('tbodyDetalle');
  document.getElementById('detalleMatricula').textContent = veh.matricula;
  document.getElementById('detalleTitulo').innerHTML =
    `Detalle — <span>${escapeHtml(veh.marca)} ${escapeHtml(veh.modelo)} (${escapeHtml(veh.matricula)})</span>`;

  tbody.innerHTML = '';

  if (partes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Sin partes en este periodo</td></tr>';
  } else {
    for (const p of partes) {
      const tr = document.createElement('tr');
      const estadoClass = p.estado === 'completado' ? 'text-success' : 'text-warning';
      tr.innerHTML = `
        <td>${p.fecha}</td>
        <td>${escapeHtml(p.clienteNombre || '—')}</td>
        <td>${escapeHtml(p.descripcion || '—')}</td>
        <td>${Number(p.kms).toLocaleString('es-ES')}</td>
        <td class="${estadoClass}">${p.estado}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  container.style.display = 'block';
  container.scrollIntoView({ behavior: 'smooth' });
}

// ── Limpiar filtros ──
function limpiarFiltros() {
  const hoy = window.utils?.todayStr?.() || new Date().toISOString().slice(0,10);
  document.getElementById('filterDesde').value = hoy;
  document.getElementById('filterHasta').value = hoy;
  document.getElementById('filterEstado').value = 'todos';
  document.getElementById('searchVehiculo').value = '';
  cargarTablaKms();
}

// ── Generar PDF ──
async function generarPDF() {
  const desde = document.getElementById('filterDesde').value;
  const hasta = document.getElementById('filterHasta').value;
  const estado = document.getElementById('filterEstado').value;

  const partes = (await window.db.dbGetAll('partesTrabajo'))
    .filter(p => p.fecha >= desde && p.fecha <= hasta &&
                 (estado === 'todos' || p.estado === estado));

  const vehiculos = await window.db.dbGetAll('vehiculos');

  // Agrupar por matrícula
  const totales = {};
  const conteo = {};
  for (const p of partes) {
    if (!totales[p.matricula]) { totales[p.matricula] = 0; conteo[p.matricula] = 0; }
    totales[p.matricula] += Number(p.kms) || 0;
    conteo[p.matricula] += 1;
  }

  const vehiculosConDatos = vehiculos.filter(v => totales[v.matricula] !== undefined);

  // Construir HTML para impresión
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Informe KMs — ${desde} a ${hasta}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; }
        h1 { font-size: 20px; margin-bottom: 5px; }
        .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 12px; }
        th { background: #f1f5f9; font-weight: bold; }
        .total-row td { font-weight: bold; background: #f8fafc; }
        .footer { font-size: 10px; color: #94a3b8; text-align: center; margin-top: 30px; }
        @media print {
          body { padding: 10mm; }
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body>
      <h1>📊 Informe de Kilometraje</h1>
      <p class="subtitle">
        Período: <strong>${desde}</strong> a <strong>${hasta}</strong>
        ${estado !== 'todos' ? ' — Estado: ' + estado : ''}
        — Generado: ${new Date().toLocaleString('es-ES')}
      </p>

      <table>
        <thead>
          <tr>
            <th>Matrícula</th>
            <th>Vehículo</th>
            <th>KM Inicial</th>
            <th>KM Suma</th>
            <th>KM Total</th>
            <th>Partes</th>
          </tr>
        </thead>
        <tbody>
  `;

  let kmTotalGeneral = 0;
  for (const v of vehiculosConDatos) {
    const kmInicial = v.km_inicial || 0;
    const kmSuma = totales[v.matricula] || 0;
    const kmTotal = kmInicial + kmSuma;
    kmTotalGeneral += kmTotal;

    html += `
          <tr>
            <td>${escapeHtml(v.matricula)}</td>
            <td>${escapeHtml(v.marca)} ${escapeHtml(v.modelo)}</td>
            <td>${kmInicial.toLocaleString('es-ES')}</td>
            <td>+${kmSuma.toLocaleString('es-ES')}</td>
            <td><strong>${kmTotal.toLocaleString('es-ES')}</strong></td>
            <td>${conteo[v.matricula]}</td>
          </tr>
    `;
  }

  html += `
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="4">TOTAL GENERAL</td>
            <td>${kmTotalGeneral.toLocaleString('es-ES')} km</td>
            <td>${partes.length} partes</td>
          </tr>
        </tfoot>
      </table>

      <!-- Detalle por vehículo -->
      <h2 style="font-size:16px; margin:20px 0 10px;">Detalle de Partes</h2>
  `;

  for (const v of vehiculosConDatos) {
    const partesVeh = partes.filter(p => p.matricula === v.matricula);
    html += `<h3 style="font-size:14px; margin:10px 0 5px;">${escapeHtml(v.matricula)} — ${escapeHtml(v.marca)} ${escapeHtml(v.modelo)}</h3>`;
    html += `<table style="margin-bottom:15px;">
      <thead><tr><th>Fecha</th><th>Cliente</th><th>Descripción</th><th>KMs</th><th>Estado</th></tr></thead><tbody>`;

    for (const p of partesVeh) {
      html += `<tr>
        <td>${p.fecha}</td>
        <td>${escapeHtml(p.clienteNombre || '—')}</td>
        <td>${escapeHtml(p.descripcion || '—')}</td>
        <td>${Number(p.kms).toLocaleString('es-ES')}</td>
        <td>${p.estado}</td>
      </tr>`;
    }

    html += `</tbody></table>`;
  }

  html += `<p class="footer">AutoPuerta Pro — Informe generado el ${new Date().toLocaleString('es-ES')}</p>`;
  html += `</body></html>`;

  // Abrir en nueva ventana e imprimir
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    win.focus();
    win.print();
  };
}

// Exponer funciones al scope global
window.render_informesKms = render_informesKms;
window.verMensual = verMensual;
window.verDetalleVehiculo = verDetalleVehiculo;
window.generarPDF = generarPDF;