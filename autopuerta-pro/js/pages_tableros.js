const TABLERO_COLUMNAS = [
  { id: 'pendiente', label: 'Pendiente', icon: 'fa-inbox' },
  { id: 'en_progreso', label: 'En progreso', icon: 'fa-person-digging' },
  { id: 'revisado', label: 'Revisar', icon: 'fa-magnifying-glass' },
  { id: 'hecho', label: 'Hecho', icon: 'fa-circle-check' }
];

let tableroActualId = localStorage.getItem('tableroActualId') || '';
let filtrosTablero = { texto: '', clienteId: '', prioridad: '' };

function escapeTablero(value) {
  return escapeHtml(String(value ?? ''));
}

function getTableroColumnLabel(status) {
  return TABLERO_COLUMNAS.find(column => column.id === status)?.label || 'Pendiente';
}

function getTableroPriorityClass(priority) {
  return { alta: 'badge-red', media: 'badge-orange', baja: 'badge-blue' }[priority] || 'badge-gray';
}

function getTableroDateLabel(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-ES');
}

function getTableroFormValue(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

async function renderTableros(container) {
  try {
    const [tableros, tarjetas, clientes, empleados] = await Promise.all([
      dbGetAll('tableros'),
      dbGetAll('tarjetasTablero'),
      dbGetAll('clientes'),
      dbGetAll('empleados')
    ]);
    if (!document.body.contains(container)) return;

    const selectedBoard = tableros.find(board => String(board.id) === String(tableroActualId)) || tableros[0];
    tableroActualId = selectedBoard?.id || '';
    if (tableroActualId) localStorage.setItem('tableroActualId', tableroActualId);
    else localStorage.removeItem('tableroActualId');

    const currentCards = tarjetas.filter(card => String(card.boardId) === String(tableroActualId));
    const visibleCards = currentCards.filter(card => {
      const matchesText = !filtrosTablero.texto
        || `${card.titulo || ''} ${card.descripcion || ''}`.toLocaleLowerCase('es').includes(filtrosTablero.texto.toLocaleLowerCase('es'));
      const matchesClient = !filtrosTablero.clienteId || String(card.clienteId || '') === filtrosTablero.clienteId;
      const matchesPriority = !filtrosTablero.prioridad || card.prioridad === filtrosTablero.prioridad;
      return matchesText && matchesClient && matchesPriority;
    });

    const boardOptions = tableros.map(board =>
      `<option value="${escapeTablero(board.id)}" ${String(board.id) === String(tableroActualId) ? 'selected' : ''}>${escapeTablero(board.nombre)}</option>`
    ).join('');
    container.innerHTML = `
      <section class="boards-page">
        <div class="page-header">
          <div><h2><i class="fas fa-table-columns"></i> Tableros</h2><p>Organiza el trabajo y comparte los cambios en tus dispositivos.</p></div>
          <div class="header-actions">
            ${selectedBoard ? `<button class="btn btn-outline btn-sm" type="button" data-board-action="rename"><i class="fas fa-pen"></i> Renombrar</button><button class="btn btn-outline btn-sm" type="button" data-board-action="delete"><i class="fas fa-trash"></i></button>` : ''}
            <button class="btn btn-primary" type="button" data-board-action="create"><i class="fas fa-plus"></i> Nuevo tablero</button>
          </div>
        </div>
        ${tableros.length ? `
          <div class="boards-toolbar">
            <select id="tableroSelector" aria-label="Seleccionar tablero">${boardOptions}</select>
            <span class="boards-toolbar-spacer"></span>
            <button class="btn btn-outline" type="button" data-board-action="search"><i class="fas fa-search"></i> Buscar${Object.values(filtrosTablero).some(Boolean) ? ' · filtros activos' : ''}</button>
            <button class="btn btn-primary" type="button" data-board-action="add-card"><i class="fas fa-plus"></i> Añadir tarjeta</button>
          </div>
          <div class="board-columns">
            ${TABLERO_COLUMNAS.map(column => {
              const columnCards = visibleCards.filter(card => (card.estado || 'pendiente') === column.id)
                .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
              return `
                <section class="board-column" data-column="${column.id}">
                  <div class="board-column-header"><h3><i class="fas ${column.icon}"></i> ${column.label}</h3><span class="board-column-count">${columnCards.length}</span></div>
                  <div class="board-card-list">
                    ${columnCards.map(card => renderTableroCard(card, clientes, empleados)).join('') || '<div class="board-card-empty">Suelta aquí una tarjeta</div>'}
                  </div>
                </section>`;
            }).join('')}
          </div>
        ` : `
          <div class="card"><div class="card-body empty-state">
            <i class="fas fa-table-columns"></i><h3>Aún no hay tableros</h3><p>Crea un tablero para empezar a organizar tus tareas.</p>
          </div></div>
        `}
      </section>`;

    bindTableroEvents(container);
  } catch (error) {
    console.error('[Tableros] Error al cargar:', error);
    const setupRequired = /tableros|tarjetas_tablero|relation|schema cache|does not exist/i.test(String(error?.message || error));
    container.innerHTML = `<div class="empty-state"><i class="fas fa-triangle-exclamation"></i><h3>No se pudieron cargar los tableros</h3><p>${setupRequired
      ? 'Falta preparar las tablas de Supabase. Ejecuta el archivo SUPABASE_TABLEROS.sql en el editor SQL de tu proyecto y vuelve a intentarlo.'
      : 'Comprueba la conexión e inténtalo de nuevo.'}</p></div>`;
  }
}

function renderTableroCard(card, clientes, empleados) {
  const client = clientes.find(item => String(item.id) === String(card.clienteId));
  const employee = empleados.find(item => String(item.id) === String(card.assigneeId));
  const dueDate = getTableroDateLabel(card.dueDate);
  const priorityLabels = { alta: 'Prioridad alta', media: 'Prioridad media', baja: 'Prioridad baja' };
  return `
    <article class="board-card" draggable="true" data-card-id="${escapeTablero(card.id)}">
      <h4>${escapeTablero(card.titulo || 'Sin título')}</h4>
      ${card.descripcion ? `<p class="board-card-description">${escapeTablero(card.descripcion)}</p>` : ''}
      <div class="board-card-meta">
        ${card.prioridad ? `<span class="badge ${getTableroPriorityClass(card.prioridad)}">${priorityLabels[card.prioridad] || escapeTablero(card.prioridad)}</span>` : ''}
        ${client ? `<span class="badge badge-gray"><i class="fas fa-building"></i> ${escapeTablero(client.nombre)}</span>` : ''}
        ${dueDate ? `<span class="badge badge-gray"><i class="fas fa-calendar"></i> ${dueDate}</span>` : ''}
      </div>
      <div class="board-card-footer">
        <small>${employee ? `<i class="fas fa-user"></i> ${escapeTablero(employee.nombre)}` : ''}</small>
        <div class="board-card-actions">
          <button class="btn btn-outline" type="button" title="Editar tarjeta" aria-label="Editar tarjeta" data-card-action="edit" data-id="${escapeTablero(card.id)}"><i class="fas fa-pen"></i></button>
          <button class="btn btn-outline" type="button" title="Eliminar tarjeta" aria-label="Eliminar tarjeta" data-card-action="delete" data-id="${escapeTablero(card.id)}"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </article>`;
}

function bindTableroEvents(container) {
  container.querySelector('#tableroSelector')?.addEventListener('change', event => {
    tableroActualId = event.target.value;
    localStorage.setItem('tableroActualId', tableroActualId);
    renderTableros(container);
  });
  container.querySelectorAll('[data-board-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.boardAction;
    const result = action === 'create' ? showTableroForm()
      : action === 'rename' ? showTableroForm(tableroActualId)
      : action === 'delete' ? deleteTablero(tableroActualId)
      : action === 'search' ? showTableroSearch()
      : action === 'add-card' ? showTableroCardForm()
      : null;
    result?.catch(error => {
      console.error('[Tableros] No se pudo abrir la acción:', error);
      showToast(`No se pudo completar la acción: ${error.message}`, 'error');
    });
  }));
  container.querySelectorAll('[data-card-action="edit"]').forEach(button =>
    button.addEventListener('click', () => showTableroCardForm(button.dataset.id).catch(error => {
      console.error('[Tableros] No se pudo abrir la tarjeta:', error);
      showToast(`No se pudo abrir la tarjeta: ${error.message}`, 'error');
    })));
  container.querySelectorAll('[data-card-action="delete"]').forEach(button =>
    button.addEventListener('click', () => deleteTableroCard(button.dataset.id)));
  container.querySelectorAll('.board-card').forEach(card => {
    card.addEventListener('dragstart', event => {
      event.dataTransfer.setData('text/plain', card.dataset.cardId);
      event.dataTransfer.effectAllowed = 'move';
      card.classList.add('is-dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
    card.addEventListener('dragover', event => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
    });
    card.addEventListener('drop', event => {
      event.preventDefault();
      event.stopPropagation();
      moveTableroCard(event.dataTransfer.getData('text/plain'), card.closest('.board-column')?.dataset.column, card.dataset.cardId);
    });
  });
  container.querySelectorAll('.board-column').forEach(column => {
    column.addEventListener('dragover', event => {
      event.preventDefault();
      column.classList.add('is-drop-target');
    });
    column.addEventListener('dragleave', event => {
      if (!column.contains(event.relatedTarget)) column.classList.remove('is-drop-target');
    });
    column.addEventListener('drop', event => {
      event.preventDefault();
      column.classList.remove('is-drop-target');
      moveTableroCard(event.dataTransfer.getData('text/plain'), column.dataset.column);
    });
  });
}

async function refreshTableros() {
  const container = document.getElementById('mainContent');
  if (window.currentPage === 'tableros' && container) await renderTableros(container);
}

window.render_tableros = renderTableros;

window.showTableroSearch = async function() {
  const [clientes] = await Promise.all([dbGetAll('clientes')]);
  const clientOptions = clientes.map(client =>
    `<option value="${escapeTablero(client.id)}" ${String(client.id) === filtrosTablero.clienteId ? 'selected' : ''}>${escapeTablero(client.nombre)}</option>`
  ).join('');
  openModal('Buscar tarjetas', `
    <form id="tableroSearchForm" class="form-grid">
      <div class="form-group full"><label for="tableroSearch">Texto</label><input id="tableroSearch" type="search" value="${escapeTablero(filtrosTablero.texto)}" placeholder="Título o descripción"></div>
      <div class="form-group"><label for="tableroClientFilter">Cliente</label><select id="tableroClientFilter"><option value="">Todos los clientes</option>${clientOptions}</select></div>
      <div class="form-group"><label for="tableroPriorityFilter">Prioridad</label><select id="tableroPriorityFilter"><option value="">Todas las prioridades</option><option value="alta" ${filtrosTablero.prioridad === 'alta' ? 'selected' : ''}>Alta</option><option value="media" ${filtrosTablero.prioridad === 'media' ? 'selected' : ''}>Media</option><option value="baja" ${filtrosTablero.prioridad === 'baja' ? 'selected' : ''}>Baja</option></select></div>
    </form>`,
    `<button class="btn btn-outline" type="button" id="tableroClearSearch">Limpiar filtros</button><button class="btn btn-outline" type="button" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" type="submit" form="tableroSearchForm">Buscar</button>`);
  document.getElementById('tableroSearchForm').addEventListener('submit', async event => {
    event.preventDefault();
    filtrosTablero = {
      texto: getTableroFormValue('tableroSearch'),
      clienteId: getTableroFormValue('tableroClientFilter'),
      prioridad: getTableroFormValue('tableroPriorityFilter')
    };
    closeModal();
    await refreshTableros();
  });
  document.getElementById('tableroClearSearch').addEventListener('click', async () => {
    filtrosTablero = { texto: '', clienteId: '', prioridad: '' };
    closeModal();
    await refreshTableros();
  });
};

window.showTableroForm = async function(boardId = '') {
  const existing = boardId ? await dbGet('tableros', boardId) : null;
  const isEditing = Boolean(existing);
  openModal(isEditing ? 'Renombrar tablero' : 'Nuevo tablero', `
    <form id="tableroForm" class="form-grid">
      <div class="form-group full"><label for="tableroNombre">Nombre *</label><input id="tableroNombre" maxlength="100" required value="${escapeTablero(existing?.nombre || '')}" placeholder="Ej.: Instalaciones"></div>
      <div class="form-group full"><label for="tableroDescripcion">Descripción</label><textarea id="tableroDescripcion" maxlength="500" placeholder="Descripción opcional">${escapeTablero(existing?.descripcion || '')}</textarea></div>
    </form>`,
    `<button class="btn btn-outline" type="button" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" type="submit" form="tableroForm">Guardar</button>`);
  document.getElementById('tableroForm').addEventListener('submit', async event => {
    event.preventDefault();
    const nombre = getTableroFormValue('tableroNombre');
    if (!nombre) return;
    const record = { ...(existing || {}), nombre, descripcion: getTableroFormValue('tableroDescripcion') };
    try {
      if (isEditing) await dbPut('tableros', record);
      else {
        const created = await dbAdd('tableros', { ...record, createdAt: new Date().toISOString() });
        tableroActualId = created.id;
        localStorage.setItem('tableroActualId', tableroActualId);
      }
      closeModal();
      showToast(isEditing ? 'Tablero actualizado' : 'Tablero creado');
      await refreshTableros();
    } catch (error) {
      console.error('[Tableros] Error al guardar tablero:', error);
      showToast(`No se pudo guardar el tablero: ${error.message}`, 'error');
    }
  });
};

window.showTableroCardForm = async function(cardId = '') {
  const [existing, clientes, empleados] = await Promise.all([
    cardId ? dbGet('tarjetasTablero', cardId) : Promise.resolve(null),
    dbGetAll('clientes'),
    dbGetAll('empleados')
  ]);
  const isEditing = Boolean(existing);
  const clientOptions = clientes.map(client => `<option value="${escapeTablero(client.id)}" ${String(client.id) === String(existing?.clienteId || '') ? 'selected' : ''}>${escapeTablero(client.nombre)}</option>`).join('');
  const employeeOptions = empleados.map(employee => `<option value="${escapeTablero(employee.id)}" ${String(employee.id) === String(existing?.assigneeId || '') ? 'selected' : ''}>${escapeTablero(employee.nombre)}</option>`).join('');
  const statusOptions = TABLERO_COLUMNAS.map(column => `<option value="${column.id}" ${column.id === (existing?.estado || 'pendiente') ? 'selected' : ''}>${column.label}</option>`).join('');
  openModal(isEditing ? 'Editar tarjeta' : 'Nueva tarjeta', `
    <form id="tableroCardForm" class="form-grid">
      <div class="form-group full"><label for="tarjetaTitulo">Título *</label><input id="tarjetaTitulo" maxlength="160" required value="${escapeTablero(existing?.titulo || '')}" placeholder="¿Qué hay que hacer?"></div>
      <div class="form-group full"><label for="tarjetaDescripcion">Descripción</label><textarea id="tarjetaDescripcion" maxlength="2000" placeholder="Detalles de la tarea">${escapeTablero(existing?.descripcion || '')}</textarea></div>
      <div class="form-group"><label for="tarjetaEstado">Columna</label><select id="tarjetaEstado">${statusOptions}</select></div>
      <div class="form-group"><label for="tarjetaPrioridad">Prioridad</label><select id="tarjetaPrioridad"><option value="">Sin prioridad</option><option value="alta" ${existing?.prioridad === 'alta' ? 'selected' : ''}>Alta</option><option value="media" ${existing?.prioridad === 'media' ? 'selected' : ''}>Media</option><option value="baja" ${existing?.prioridad === 'baja' ? 'selected' : ''}>Baja</option></select></div>
      <div class="form-group"><label for="tarjetaCliente">Cliente</label><select id="tarjetaCliente"><option value="">Sin cliente</option>${clientOptions}</select></div>
      <div class="form-group"><label for="tarjetaResponsable">Responsable</label><select id="tarjetaResponsable"><option value="">Sin asignar</option>${employeeOptions}</select></div>
      <div class="form-group"><label for="tarjetaFecha">Fecha límite</label><input id="tarjetaFecha" type="date" value="${escapeTablero(existing?.dueDate || '')}"></div>
    </form>`,
    `<button class="btn btn-outline" type="button" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" type="submit" form="tableroCardForm">Guardar</button>`);
  document.getElementById('tableroCardForm').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const state = getTableroFormValue('tarjetaEstado');
      const allCards = await dbGetAll('tarjetasTablero');
      const statusCards = allCards.filter(card => String(card.boardId) === String(tableroActualId) && card.estado === state);
      const record = {
        ...(existing || {}),
        boardId: tableroActualId,
        titulo: getTableroFormValue('tarjetaTitulo'),
        descripcion: getTableroFormValue('tarjetaDescripcion'),
        estado: state,
        prioridad: getTableroFormValue('tarjetaPrioridad'),
        clienteId: getTableroFormValue('tarjetaCliente') || null,
        assigneeId: getTableroFormValue('tarjetaResponsable') || null,
        dueDate: getTableroFormValue('tarjetaFecha') || null,
        order: existing?.estado === state ? (Number(existing.order) || 0) : Math.max(-1, ...statusCards.filter(card => String(card.id) !== String(existing?.id)).map(card => Number(card.order) || 0)) + 1
      };
      if (isEditing) await dbPut('tarjetasTablero', record);
      else await dbAdd('tarjetasTablero', { ...record, createdAt: new Date().toISOString() });
      closeModal();
      showToast(isEditing ? 'Tarjeta actualizada' : 'Tarjeta creada');
      await refreshTableros();
    } catch (error) {
      console.error('[Tableros] Error al guardar tarjeta:', error);
      showToast(`No se pudo guardar la tarjeta: ${error.message}`, 'error');
    }
  });
};

window.deleteTableroCard = function(cardId) {
  confirmDelete('esta tarjeta', async () => {
    try {
      await dbDelete('tarjetasTablero', cardId);
      showToast('Tarjeta eliminada');
      await refreshTableros();
    } catch (error) {
      console.error('[Tableros] Error al eliminar tarjeta:', error);
      showToast(`No se pudo eliminar la tarjeta: ${error.message}`, 'error');
    }
  });
};

window.deleteTablero = function(boardId) {
  confirmDelete('este tablero y todas sus tarjetas', async () => {
    try {
      const cards = await dbGetAll('tarjetasTablero');
      for (const card of cards.filter(item => String(item.boardId) === String(boardId))) {
        await dbDelete('tarjetasTablero', card.id);
      }
      await dbDelete('tableros', boardId);
      tableroActualId = '';
      localStorage.removeItem('tableroActualId');
      showToast('Tablero eliminado');
      await refreshTableros();
    } catch (error) {
      console.error('[Tableros] Error al eliminar tablero:', error);
      showToast(`No se pudo eliminar el tablero: ${error.message}`, 'error');
    }
  });
};

async function moveTableroCard(cardId, nextStatus, beforeCardId = '') {
  if (!TABLERO_COLUMNAS.some(column => column.id === nextStatus)) return;
  try {
    const card = await dbGet('tarjetasTablero', cardId);
    if (!card || (card.id === beforeCardId && card.estado === nextStatus)) return;
    const cards = await dbGetAll('tarjetasTablero');
    const nextColumnCards = cards
      .filter(item => String(item.boardId) === String(card.boardId) && item.estado === nextStatus && String(item.id) !== String(cardId))
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    const targetIndex = beforeCardId
      ? nextColumnCards.findIndex(item => String(item.id) === String(beforeCardId))
      : -1;
    if (targetIndex === -1) nextColumnCards.push(card);
    else nextColumnCards.splice(targetIndex, 0, card);
    for (let index = 0; index < nextColumnCards.length; index++) {
      const item = nextColumnCards[index];
      if (item.estado !== nextStatus || Number(item.order) !== index) {
        await dbPut('tarjetasTablero', { ...item, estado: nextStatus, order: index });
      }
    }
    showToast(card.estado === nextStatus ? 'Orden de tarjetas actualizado' : `Tarjeta movida a «${getTableroColumnLabel(nextStatus)}»`);
    await refreshTableros();
  } catch (error) {
    console.error('[Tableros] Error al mover tarjeta:', error);
    showToast(`No se pudo mover la tarjeta: ${error.message}`, 'error');
    await refreshTableros();
  }
}
