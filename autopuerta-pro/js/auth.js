const TECH_PAGES = new Set(['dashboard', 'partesTrabajo', 'presupuestos', 'informesKms', 'revisionesProgramadas', 'almacen', 'ayuda']);
const HELP_GUIDES = [
  { page: 'dashboard', title: 'Dashboard', roles: ['admin', 'technician'], text: 'Consulta el resumen general. Los técnicos ven sus partes recientes y avisos operativos; administración ve los indicadores de toda la empresa.' },
  { page: 'partesTrabajo', title: 'Partes de trabajo', roles: ['admin', 'technician'], text: 'Crea un parte, elige cliente, ubicación, puerta y vehículo, completa el trabajo y guarda. Los técnicos pueden ver todos los partes, pero editar o eliminar solo los propios. DNI, firmas y fotos se muestran solo en los propios.' },
  { page: 'presupuestos', title: 'Solicitudes de material y presupuestos', roles: ['admin', 'technician'], text: 'Los técnicos envían solicitudes con cliente, artículos y cantidades; no ven precios. Oficina revisa cada solicitud y la convierte en presupuesto para completar precios y enviarlo al cliente.' },
  { page: 'informesKms', title: 'Informes KMs', roles: ['admin', 'technician'], text: 'El kilometraje se calcula a partir de los partes de trabajo. El informe permite consultar y exportar los kilómetros de los vehículos del equipo.' },
  { page: 'revisionesProgramadas', title: 'Revisiones programadas', roles: ['admin', 'technician'], text: 'Consulta las revisiones por cadena, ruta y puerta. Los técnicos pueden registrar el resultado de una revisión; solo administración cambia la programación.' },
  { page: 'almacen', title: 'Almacén', roles: ['admin', 'technician'], text: 'Consulta artículos y existencias. A los técnicos se les ocultan precios, costes y controles de edición.' },
  { page: 'tableros', title: 'Tableros', roles: ['admin'], text: 'Organiza tareas en columnas. Crea tarjetas, asígnalas y muévelas entre estados arrastrándolas.' },
  { page: 'configuracion', title: 'Configuración', roles: ['admin'], text: 'Administra cuentas y roles del equipo, además de las opciones generales de la aplicación.' }
];

window.authState = { user: null, profile: null, employee: null };
let authProfileChannel = null;
window.isAdmin = () => window.authState.profile?.role === 'admin' && window.authState.profile?.is_active === true;
window.isTechnician = () => window.authState.profile?.role === 'technician' && window.authState.profile?.is_active === true;
window.canAccessPage = page => window.isAdmin() || (window.isTechnician() && TECH_PAGES.has(page));

function authEscape(value) {
  return escapeHtml(String(value ?? ''));
}

async function callTeamAdmin(body) {
  const { data, error } = await window.supabaseDB.functions.invoke('team-admin', { body });
  if (error) {
    const context = error.context;
    let message = error.message;
    if (context && typeof context.json === 'function') {
      try {
        const response = await context.json();
        if (response.error) message = response.error;
      } catch {
        // Keep the SDK error if the response is not JSON.
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function showAuthError(message) {
  const error = document.getElementById('authError');
  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
}

function isPasswordRecovery() {
  return location.hash.includes('type=recovery');
}

function renderPasswordRecovery() {
  const screen = document.getElementById('authScreen');
  screen.hidden = false;
  document.querySelector('.app-container').hidden = true;
  screen.innerHTML = `
    <div class="auth-card">
      <img src="icons/icon-192.png" alt="Valgom" class="auth-logo">
      <h1>Restablecer contraseña</h1>
      <p class="auth-intro">Elige una contraseña nueva de al menos 12 caracteres.</p>
      <div id="authError" class="auth-error" role="alert" hidden></div>
      <form id="recoveryForm" class="auth-form">
        <label>Nueva contraseña<input id="recoveryPassword" type="password" autocomplete="new-password" minlength="12" required></label>
        <label>Repite la contraseña<input id="recoveryPasswordConfirm" type="password" autocomplete="new-password" minlength="12" required></label>
        <button class="btn btn-primary" type="submit">Guardar contraseña</button>
      </form>
    </div>`;
  screen.querySelector('#recoveryForm').addEventListener('submit', async event => {
    event.preventDefault();
    const password = screen.querySelector('#recoveryPassword').value;
    if (password !== screen.querySelector('#recoveryPasswordConfirm').value) {
      return showAuthError('Las contraseñas no coinciden.');
    }
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      history.replaceState(null, '', location.pathname + location.search);
      const { error } = await window.supabaseDB.auth.updateUser({ password });
      if (error) throw error;
      showToast('Contraseña actualizada');
      const { data: { user } } = await window.supabaseDB.auth.getUser();
      if (user) {
        await loadAuthProfile(user);
        window.dispatchEvent(new CustomEvent('valgom:authenticated'));
      }
    } catch (error) {
      showAuthError(`No se pudo actualizar la contraseña: ${error.message}`);
    } finally {
      button.disabled = false;
    }
  });
}

function renderAuthScreen(needsBootstrap, notice = '') {
  const screen = document.getElementById('authScreen');
  screen.hidden = false;
  document.querySelector('.app-container').hidden = true;
  screen.innerHTML = `
    <div class="auth-card">
      <img src="icons/icon-192.png" alt="Valgom" class="auth-logo">
      <h1>${needsBootstrap ? 'Configurar administración' : 'Iniciar sesión'}</h1>
      <p class="auth-intro">${needsBootstrap
        ? 'Crea la primera cuenta administradora usando el código de activación seguro.'
        : 'Accede con la cuenta individual de tu empresa.'}</p>
      ${notice ? `<p class="auth-notice">${authEscape(notice)}</p>` : ''}
      <div id="authError" class="auth-error" role="alert" hidden></div>
      ${needsBootstrap ? `
        <form id="bootstrapForm" class="auth-form">
          <label>Nombre completo<input id="bootstrapName" autocomplete="name" required maxlength="120"></label>
          <label>Correo electrónico<input id="bootstrapEmail" type="email" autocomplete="email" required></label>
          <label>Contraseña (mínimo 12 caracteres)<input id="bootstrapPassword" type="password" autocomplete="new-password" minlength="12" required></label>
          <label>Código de activación de un solo uso<input id="bootstrapCode" type="password" autocomplete="off" required></label>
          <button class="btn btn-primary" type="submit">Crear primera cuenta administradora</button>
        </form>
      ` : `
        <form id="loginForm" class="auth-form">
          <label>Correo electrónico<input id="loginEmail" type="email" autocomplete="username" required></label>
          <label>Contraseña<input id="loginPassword" type="password" autocomplete="current-password" required></label>
          <button class="btn btn-primary" type="submit">Entrar</button>
          <button class="auth-link" type="button" id="resetPassword">He olvidado mi contraseña</button>
        </form>
      `}
      <p class="auth-footer">Acceso exclusivo para miembros activos del equipo.</p>
    </div>`;

  if (needsBootstrap) {
    screen.querySelector('#bootstrapForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await callTeamAdmin({
          action: 'bootstrap-admin',
          fullName: screen.querySelector('#bootstrapName').value.trim(),
          email: screen.querySelector('#bootstrapEmail').value.trim(),
          password: screen.querySelector('#bootstrapPassword').value,
          code: screen.querySelector('#bootstrapCode').value
        });
        renderAuthScreen(false, 'Cuenta administradora creada. Ya puedes iniciar sesión.');
      } catch (error) {
        showAuthError(error.message);
      } finally {
        button.disabled = false;
      }
    });
    return;
  }

  screen.querySelector('#loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const { error } = await window.supabaseDB.auth.signInWithPassword({
        email: screen.querySelector('#loginEmail').value.trim(),
        password: screen.querySelector('#loginPassword').value
      });
      if (error) throw error;
    } catch (error) {
      showAuthError(`No se pudo iniciar sesión: ${error.message}`);
    } finally {
      button.disabled = false;
    }
  });
  screen.querySelector('#resetPassword').addEventListener('click', async () => {
    const email = screen.querySelector('#loginEmail').value.trim();
    if (!email) return showAuthError('Escribe primero tu correo electrónico.');
    const { error } = await window.supabaseDB.auth.resetPasswordForEmail(email, {
      redirectTo: location.href.split('#')[0]
    });
    if (error) showAuthError(`No se pudo enviar el correo: ${error.message}`);
    else showAuthError('Si la cuenta existe, recibirás un correo para restablecer la contraseña.');
  });
}

async function loadAuthProfile(user) {
  const { data: profile, error } = await window.supabaseDB
    .from('user_profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (!profile || !profile.is_active) {
    await window.supabaseDB.auth.signOut();
    throw new Error('Esta cuenta no está activa. Contacta con un administrador.');
  }
  const previousRole = window.authState.profile?.role;
  if (previousRole && previousRole !== profile.role) await window.clearAuthenticatedCache();
  let employee = null;
  if (profile.role === 'technician' && profile.employee_id) {
    const { data, error: employeeError } = await window.supabaseDB.rpc('get_my_employee');
    if (employeeError) throw employeeError;
    employee = data;
    if (!employee) throw new Error('La cuenta técnica no tiene una ficha de Empleados válida. Contacta con administración.');
  }
  window.authState = { user, profile, employee };
  document.getElementById('authScreen').hidden = true;
  document.querySelector('.app-container').hidden = false;
  updateAuthNavigation();
  if (authProfileChannel) window.supabaseDB.removeChannel(authProfileChannel);
  authProfileChannel = window.supabaseDB
    .channel(`profile-${user.id}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'user_profiles',
      filter: `id=eq.${user.id}`
    }, () => {
      setTimeout(async () => {
        try {
          await loadAuthProfile(user);
          window.dispatchEvent(new CustomEvent('valgom:authenticated'));
        } catch (profileError) {
          console.error('[Auth] El perfil dejó de estar activo:', profileError);
          await window.supabaseDB.auth.signOut();
        }
      }, 0);
    })
    .subscribe();
  return profile;
}

function updateAuthNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.hidden = !window.canAccessPage(item.dataset.page);
    if (item.dataset.page === 'presupuestos') {
      item.querySelector('span').textContent = window.isTechnician() ? 'Solicitudes de material' : 'Presupuestos';
    }
  });
  const account = document.getElementById('authAccount');
  if (!account) return;
  const { profile } = window.authState;
  account.innerHTML = `
    <div class="auth-account-name" title="${authEscape(profile.email)}">${authEscape(profile.full_name)}</div>
    <div class="auth-account-role">${profile.role === 'admin' ? 'Administrador' : 'Técnico'}</div>
    <button type="button" class="auth-link auth-account-email" id="changeAccountEmail">Cambiar correo</button>
    <button type="button" class="auth-link auth-logout" id="logoutButton"><i class="fas fa-right-from-bracket"></i> Cerrar sesión</button>`;
  account.querySelector('#logoutButton').addEventListener('click', () => window.supabaseDB.auth.signOut());
  account.querySelector('#changeAccountEmail').addEventListener('click', openChangeAccountEmail);
}

function openChangeAccountEmail() {
  openModal('Cambiar correo de acceso', `
    <form id="changeAccountEmailForm" class="form-grid">
      <p class="full">El cambio se aplicará directamente y el correo nuevo quedará confirmado.</p>
      <div class="form-group full"><label for="newAccountEmail">Nuevo correo</label><input id="newAccountEmail" type="email" value="${authEscape(window.authState.profile.email)}" autocomplete="email" required></div>
      <div class="form-group full"><button class="btn btn-primary" type="submit">Guardar correo</button></div>
    </form>`,
    '<button class="btn btn-outline" type="button" onclick="closeModal()">Cancelar</button>');
  document.getElementById('changeAccountEmailForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const email = document.getElementById('newAccountEmail').value.trim().toLowerCase();
      const result = await callTeamAdmin({ action: 'update-own-email', email });
      window.authState.profile.email = result.email;
      if (window.authState.user) window.authState.user.email = result.email;
      updateAuthNavigation();
      closeModal();
      showToast('Correo de acceso actualizado');
    } catch (error) {
      showToast(`No se pudo cambiar el correo: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
    }
  });
}

async function initializeAuth() {
  try {
    const { data: { session }, error } = await window.supabaseDB.auth.getSession();
    if (error) throw error;
    if (session?.user) {
      if (isPasswordRecovery()) {
        await window.clearAuthenticatedCache();
        renderPasswordRecovery();
      }
      else {
        await window.clearAuthenticatedCache();
        await loadAuthProfile(session.user);
      }
    } else {
      const result = await callTeamAdmin({ action: 'bootstrap-status' });
      renderAuthScreen(Boolean(result.needsBootstrap));
    }
  } catch (error) {
    console.error('[Auth] No se pudo iniciar el control de acceso:', error);
    renderAuthScreen(false, 'No se pudo conectar con el servicio de acceso. Contacta con administración.');
    showAuthError(error.message);
  }

  window.supabaseDB.auth.onAuthStateChange((event, session) => {
    setTimeout(async () => {
      if (event === 'PASSWORD_RECOVERY' || isPasswordRecovery()) {
        if (!window.authState.user) await window.clearAuthenticatedCache();
        renderPasswordRecovery();
        return;
      }
      if (session?.user) {
        try {
          const previousUser = window.authState.user?.id;
          if (previousUser && previousUser !== session.user.id) await window.clearAuthenticatedCache();
          await loadAuthProfile(session.user);
          if (event === 'SIGNED_IN' || previousUser !== session.user.id) {
            window.dispatchEvent(new CustomEvent('valgom:authenticated'));
          }
        } catch (error) {
          console.error('[Auth] Sesión rechazada:', error);
          renderAuthScreen(false);
          showAuthError(error.message);
        }
      } else {
        const hadUser = Boolean(window.authState.user);
        if (hadUser) await window.clearAuthenticatedCache();
        if (authProfileChannel) {
          window.supabaseDB.removeChannel(authProfileChannel);
          authProfileChannel = null;
        }
        window.authState = { user: null, profile: null, employee: null };
        document.querySelector('.app-container').hidden = true;
        try {
          const status = await callTeamAdmin({ action: 'bootstrap-status' });
          renderAuthScreen(Boolean(status.needsBootstrap));
        } catch (error) {
          console.error('[Auth] No se pudo comprobar el estado inicial:', error);
          renderAuthScreen(false);
          showAuthError('No se pudo conectar con el servicio de acceso.');
        }
        if (hadUser) window.dispatchEvent(new CustomEvent('valgom:logged-out'));
      }
    }, 0);
  });
}

window.appAuthReady = new Promise(resolve => {
  document.addEventListener('DOMContentLoaded', () => {
    initializeAuth().finally(resolve);
  }, { once: true });
});

window.render_ayuda = async function(container) {
  const role = window.isAdmin() ? 'admin' : 'technician';
  const guides = HELP_GUIDES.filter(guide => guide.roles.includes(role));
  container.innerHTML = `
    <div class="page-header"><div><h2><i class="fas fa-circle-question"></i> Ayuda</h2><p>Guías breves para utilizar Valgom.</p></div></div>
    <div class="help-search"><i class="fas fa-search"></i><input id="helpSearch" type="search" placeholder="Buscar una pantalla o tarea..." aria-label="Buscar en las guías"></div>
    <div class="help-guides">${guides.map(guide => `
      <details class="card help-guide" data-search="${authEscape(`${guide.title} ${guide.text}`.toLocaleLowerCase('es'))}">
        <summary class="card-header"><h3>${authEscape(guide.title)}</h3><i class="fas fa-chevron-down"></i></summary>
        <div class="card-body"><p>${authEscape(guide.text)}</p></div>
      </details>`).join('')}
    </div>`;
  container.querySelector('#helpSearch').addEventListener('input', event => {
    const query = event.target.value.toLocaleLowerCase('es').trim();
    container.querySelectorAll('.help-guide').forEach(guide => {
      guide.hidden = Boolean(query) && !guide.dataset.search.includes(query);
      if (query && !guide.hidden) guide.open = true;
      if (!query) guide.open = false;
    });
  });
};

window.renderTechnicianDashboard = async function(container) {
  const [parts, revisions] = await Promise.all([dbGetAll('partesTrabajo'), dbGetAll('puertas')]);
  const ownParts = parts.filter(part => String(part.createdBy) === String(window.authState.user.id));
  const pendingParts = ownParts.filter(part => part.estado !== 'completado');
  const recent = ownParts.slice().sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))).slice(0, 6);
  const due = revisions.filter(door => door.proximaRevision && door.proximaRevision <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  container.innerHTML = `
    <div class="page-header"><div><h2>Hola, ${authEscape(window.authState.profile.full_name.split(' ')[0])}</h2><p>Tu resumen de trabajo</p></div></div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon"><i class="fas fa-clipboard-list"></i></div><div class="stat-info"><h3>${pendingParts.length}</h3><p>Mis partes pendientes</p></div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fas fa-calendar-check"></i></div><div class="stat-info"><h3>${due.length}</h3><p>Revisiones próximas</p></div></div>
    </div>
    <div class="card"><div class="card-header"><h3>Mis partes recientes</h3><button class="btn btn-outline btn-sm" onclick="navigateTo('partesTrabajo')">Ver todos</button></div>
      <div class="table-wrapper"><table><thead><tr><th>Parte</th><th>Cliente</th><th>Trabajo</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>
        ${recent.map(part => `<tr><td>${authEscape(part.id)}</td><td>${authEscape(part.clienteNombre)}</td><td>${authEscape(part.tipoPuerta)}</td><td>${authEscape(getStatusLabel(part.estado))}</td><td>${authEscape(formatDate(part.fecha))}</td></tr>`).join('') || '<tr><td colspan="5">Todavía no tienes partes.</td></tr>'}
      </tbody></table></div>
    </div>
    <div class="card"><div class="card-header"><h3>Avisos de revisiones</h3><button class="btn btn-outline btn-sm" onclick="navigateTo('revisionesProgramadas')">Ver revisiones</button></div>
      <div class="card-body">${due.slice(0, 8).map(door => `<p class="help-notice"><strong>${authEscape(door.clienteNombre || door.nombre || 'Puerta')}</strong> · Próxima revisión: ${authEscape(formatDate(door.proximaRevision))}</p>`).join('') || '<p>No hay revisiones próximas en los siguientes 30 días.</p>'}</div>
    </div>`;
};

window.renderTechnicianWarehouse = async function(container) {
  const articles = await dbGetAll('almacen');
  container.innerHTML = `
    <div class="page-header"><div><h2>Almacén</h2><p>Consulta de referencias y existencias.</p></div></div>
    <div class="search-bar"><input id="techWarehouseSearch" type="search" placeholder="Buscar por referencia o nombre"></div>
    <div class="card"><div class="table-wrapper"><table><thead><tr><th>Referencia</th><th>Artículo</th><th>Stock</th></tr></thead><tbody id="techWarehouseRows"></tbody></table></div></div>`;
  const paint = () => {
    const query = container.querySelector('#techWarehouseSearch').value.toLocaleLowerCase('es').trim();
    const rows = articles.filter(item => `${item.referencia || ''} ${item.nombre || ''}`.toLocaleLowerCase('es').includes(query));
    container.querySelector('#techWarehouseRows').innerHTML = rows.map(item => `<tr><td>${authEscape(item.referencia)}</td><td>${authEscape(item.nombre)}</td><td>${authEscape(item.stock)}</td></tr>`).join('') || '<tr><td colspan="3">Sin artículos.</td></tr>';
  };
  container.querySelector('#techWarehouseSearch').addEventListener('input', paint);
  paint();
};

window.renderTechnicianRequests = async function(container) {
  const requests = await dbGetAll('solicitudesMaterial');
  container.innerHTML = `
    <div class="page-header"><div><h2>Solicitudes de material</h2><p>Indica a oficina qué artículos y cantidades necesita el cliente.</p></div><button class="btn btn-primary" type="button" id="newMaterialRequest"><i class="fas fa-plus"></i> Nueva solicitud</button></div>
    <div class="card"><div class="table-wrapper"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Material</th><th>Estado</th><th></th></tr></thead><tbody>
      ${requests.slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).map(request => {
        const mine = String(request.createdBy) === String(window.authState.user.id);
        const itemText = (request.articulos || []).map(item => `${item.nombre} × ${item.cantidad}`).join(', ');
        return `<tr><td>${authEscape(formatDate(request.createdAt))}</td><td>${authEscape(request.clienteNombre)}</td><td>${authEscape(itemText)}</td><td>${request.estado === 'convertida' ? 'Convertida' : 'Pendiente'}</td><td>${mine && request.estado === 'pendiente' ? `<button class="btn btn-outline btn-sm" type="button" data-edit-request="${authEscape(request.id)}">Editar</button><button class="btn btn-outline btn-sm" type="button" data-delete-request="${authEscape(request.id)}">Eliminar</button>` : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="5">Todavía no hay solicitudes.</td></tr>'}
    </tbody></table></div></div>`;
  container.querySelector('#newMaterialRequest').addEventListener('click', () => showMaterialRequestForm());
  container.querySelectorAll('[data-edit-request]').forEach(button => button.addEventListener('click', () => showMaterialRequestForm(button.dataset.editRequest)));
  container.querySelectorAll('[data-delete-request]').forEach(button => button.addEventListener('click', () => deleteMaterialRequest(button.dataset.deleteRequest)));
};

window.showMaterialRequestForm = async function(requestId = '') {
  const [request, clients, articles] = await Promise.all([
    requestId ? dbGet('solicitudesMaterial', requestId) : Promise.resolve(null),
    dbGetAll('clientes'),
    dbGetAll('almacen')
  ]);
  if (request && (String(request.createdBy) !== String(window.authState.user.id) || request.estado !== 'pendiente')) {
    return showToast('Solo puedes editar tus propias solicitudes pendientes.', 'error');
  }
  const clientOptions = clients.map(client => `<option value="${authEscape(client.id)}" ${String(client.id) === String(request?.clienteId || '') ? 'selected' : ''}>${authEscape(client.nombre)}</option>`).join('');
  const articleOptions = articles.map(article => `<option value="${authEscape(article.id)}">${authEscape(article.referencia)} · ${authEscape(article.nombre)} · stock ${authEscape(article.stock)}</option>`).join('');
  const items = request?.articulos || [];
  const itemRows = items.map(item => `<li data-article="${authEscape(item.articuloId)}">${authEscape(item.referencia)} · ${authEscape(item.nombre)} × ${authEscape(item.cantidad)} <button type="button" class="btn btn-outline btn-sm" data-remove-article="${authEscape(item.articuloId)}" aria-label="Quitar artículo">×</button></li>`).join('');
  openModal(request ? 'Editar solicitud' : 'Nueva solicitud de material', `
    <form id="materialRequestForm" class="form-grid">
      <div class="form-group full"><label for="requestClient">Cliente *</label><select id="requestClient" required><option value="">Selecciona un cliente</option>${clientOptions}</select></div>
      <div class="form-group full"><label for="requestDescription">Descripción</label><textarea id="requestDescription" maxlength="1000">${authEscape(request?.descripcion || '')}</textarea></div>
      <div class="form-group full"><label for="requestArticle">Artículo del almacén</label><div class="request-add-article"><select id="requestArticle"><option value="">Selecciona un artículo</option>${articleOptions}</select><input id="requestQuantity" type="number" min="1" step="1" value="1" aria-label="Cantidad"><button type="button" class="btn btn-outline" id="addRequestArticle">Añadir</button></div></div>
      <div class="form-group full"><label>Material solicitado (sin precios)</label><ul id="requestArticleList" class="request-article-list">${itemRows || '<li class="muted">Aún no hay artículos.</li>'}</ul></div>
    </form>`,
    `<button class="btn btn-outline" type="button" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" type="submit" form="materialRequestForm">Enviar a oficina</button>`);

  let selectedItems = items.slice();
  const paintItems = () => {
    const list = document.getElementById('requestArticleList');
    list.innerHTML = selectedItems.map(item => `<li data-article="${authEscape(item.articuloId)}">${authEscape(item.referencia)} · ${authEscape(item.nombre)} × ${authEscape(item.cantidad)} <button type="button" class="btn btn-outline btn-sm" data-remove-article="${authEscape(item.articuloId)}" aria-label="Quitar artículo">×</button></li>`).join('') || '<li class="muted">Aún no hay artículos.</li>';
    list.querySelectorAll('[data-remove-article]').forEach(button => button.addEventListener('click', () => {
      selectedItems = selectedItems.filter(item => String(item.articuloId) !== button.dataset.removeArticle);
      paintItems();
    }));
  };
  paintItems();
  document.getElementById('addRequestArticle').addEventListener('click', () => {
    const id = document.getElementById('requestArticle').value;
    const quantity = Number(document.getElementById('requestQuantity').value);
    const article = articles.find(item => String(item.id) === id);
    if (!article || !Number.isInteger(quantity) || quantity < 1) return showToast('Selecciona un artículo y una cantidad válida.', 'error');
    const existing = selectedItems.find(item => String(item.articuloId) === id);
    if (existing) existing.cantidad += quantity;
    else selectedItems.push({ articuloId: article.id, referencia: article.referencia || '', nombre: article.nombre, cantidad: quantity });
    paintItems();
  });
  document.getElementById('materialRequestForm').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const selector = document.getElementById('requestClient');
      const clienteId = selector.value;
      const clienteNombre = selector.selectedOptions[0]?.textContent || '';
      if (!clienteId || !selectedItems.length) throw new Error('Selecciona un cliente y al menos un artículo.');
      const record = {
        ...(request || {}),
        clienteId, clienteNombre,
        descripcion: document.getElementById('requestDescription').value.trim(),
        articulos: selectedItems,
        estado: 'pendiente'
      };
      if (request) await dbPut('solicitudesMaterial', record);
      else await dbAdd('solicitudesMaterial', record);
      closeModal();
      showToast('Solicitud enviada a oficina');
      await navigateTo('presupuestos');
    } catch (error) {
      console.error('[SolicitudesMaterial] No se pudo guardar:', error);
      showToast(error.message, 'error');
    }
  });
};

window.deleteMaterialRequest = function(id) {
  confirmDelete('esta solicitud pendiente', async () => {
    try {
      const request = await dbGet('solicitudesMaterial', id);
      if (!request || request.estado !== 'pendiente' || String(request.createdBy) !== String(window.authState.user.id)) {
        throw new Error('Solo puedes eliminar tus propias solicitudes pendientes.');
      }
      await dbDelete('solicitudesMaterial', id);
      showToast('Solicitud eliminada');
      await navigateTo('presupuestos');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
};

window.openAdminMaterialRequests = async function() {
  const [requests, profiles] = await Promise.all([
    dbGetAll('solicitudesMaterial'),
    window.supabaseDB.from('user_profiles').select('id,full_name').then(({ data, error }) => {
      if (error) throw error;
      return data || [];
    })
  ]);
  openModal('Solicitudes de material', `
    <div class="table-wrapper"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Solicita</th><th>Material</th><th>Estado</th><th></th></tr></thead><tbody>
      ${requests.slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).map(request => {
        const author = profiles.find(profile => profile.id === request.createdBy)?.full_name || 'Técnico';
        const materials = (request.articulos || []).map(item => `${item.nombre} × ${item.cantidad}`).join(', ');
        return `<tr><td>${authEscape(formatDate(request.createdAt))}</td><td>${authEscape(request.clienteNombre)}</td><td>${authEscape(author)}</td><td>${authEscape(materials)}</td><td>${request.estado === 'convertida' ? 'Convertida' : 'Pendiente'}</td><td>${request.estado === 'pendiente' ? `<button type="button" class="btn btn-primary btn-sm" data-convert-request="${authEscape(request.id)}">Crear presupuesto</button>` : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="6">No hay solicitudes.</td></tr>'}
    </tbody></table></div>`,
    '<button class="btn btn-outline" type="button" onclick="closeModal()">Cerrar</button>');
  document.querySelectorAll('[data-convert-request]').forEach(button => button.addEventListener('click', () => convertMaterialRequest(button.dataset.convertRequest)));
};

window.convertMaterialRequest = async function(id) {
  let createdBudgetId = null;
  try {
    const request = await dbGet('solicitudesMaterial', id);
    if (!request || request.estado !== 'pendiente') throw new Error('La solicitud ya no está pendiente.');
    const lineItems = (request.articulos || []).map(item => ({
      descripcion: `${item.referencia ? item.referencia + ' · ' : ''}${item.nombre}`,
      tipoId: '', cantidad: Number(item.cantidad) || 1, precio: 0
    }));
    if (!lineItems.length) throw new Error('La solicitud no contiene artículos.');
    const budgetId = window.db.nextId('PRES');
    createdBudgetId = budgetId;
    const budget = {
      id: budgetId, clienteId: request.clienteId, clienteNombre: request.clienteNombre,
      fecha: getToday(), validoHasta: '', estado: 'borrador',
      notas: `Creado desde solicitud de material ${request.id}. Completar precios antes de enviar al cliente.`,
      lineItems, subtotal: 0, iva: 0, total: 0
    };
    await dbAdd('presupuestos', budget);
    await dbPut('solicitudesMaterial', { ...request, estado: 'convertida', presupuestoId: budgetId });
    closeModal();
    showToast('Presupuesto creado como borrador; revisa y completa los precios.');
    await navigateTo('presupuestos');
  } catch (error) {
    if (createdBudgetId) {
      try {
        await dbDelete('presupuestos', createdBudgetId);
      } catch (rollbackError) {
        console.error('[SolicitudesMaterial] No se pudo retirar el borrador parcial:', rollbackError);
      }
    }
    console.error('[SolicitudesMaterial] Error al convertir:', error);
    showToast(error.message, 'error');
  }
};

window.openUserManagement = async function() {
  try {
    const [{ data: profiles, error }, employees] = await Promise.all([
      window.supabaseDB.from('user_profiles').select('*').order('created_at'),
      dbGetAll('empleados')
    ]);
    if (error) throw error;
    openModal('Usuarios y permisos', `
      <div class="user-list">${(profiles || []).map(profile => `
        <article class="user-row">
          <div><strong>${authEscape(profile.full_name)}</strong><small>${authEscape(profile.email)}</small><small>${profile.is_active ? 'Activa' : 'Desactivada'}</small></div>
          <label>Rol<select data-user-role="${authEscape(profile.id)}"><option value="technician" ${profile.role === 'technician' ? 'selected' : ''}>Técnico</option><option value="admin" ${profile.role === 'admin' ? 'selected' : ''}>Administrador</option></select></label>
          <label>Empleado<select data-user-employee="${authEscape(profile.id)}" ${profile.role === 'admin' ? 'disabled' : ''}><option value="">Selecciona empleado</option>${employees.map(employee => `<option value="${authEscape(employee.id)}" ${String(employee.id) === String(profile.employee_id || '') ? 'selected' : ''}>${authEscape(employee.nombre)}</option>`).join('')}</select></label>
          <button class="btn btn-outline btn-sm" type="button" data-save-user="${authEscape(profile.id)}">Guardar cambios</button>
          <button class="btn ${profile.is_active ? 'btn-danger' : 'btn-primary'} btn-sm" type="button" data-toggle-user="${authEscape(profile.id)}">${profile.is_active ? 'Desactivar' : 'Reactivar'}</button>
        </article>`).join('') || '<p>No hay cuentas.</p>'}
      </div>
      <hr style="margin:18px 0;border-color:var(--border)">
      <h3>Invitar a una persona</h3>
      <form id="inviteUserForm" class="form-grid">
        <div class="form-group"><label for="inviteName">Nombre</label><input id="inviteName" required maxlength="120"></div>
        <div class="form-group"><label for="inviteEmail">Correo</label><input id="inviteEmail" type="email" required></div>
        <div class="form-group"><label for="inviteRole">Rol</label><select id="inviteRole"><option value="technician">Técnico</option><option value="admin">Administrador</option></select></div>
        <div class="form-group"><label for="inviteEmployee">Ficha de empleado</label><select id="inviteEmployee"><option value="">Selecciona empleado</option>${employees.map(employee => `<option value="${authEscape(employee.id)}">${authEscape(employee.nombre)}</option>`).join('')}</select></div>
        <div class="form-group full"><button class="btn btn-primary" type="submit">Enviar invitación por correo</button></div>
      </form>
      <p class="user-management-note">Los técnicos deben vincularse a una ficha de Empleados. La invitación permite establecer su contraseña desde el correo.</p>`,
      '<button class="btn btn-outline" type="button" onclick="closeModal()">Cerrar</button>');

    document.getElementById('inviteRole').addEventListener('change', event => {
      document.getElementById('inviteEmployee').disabled = event.target.value === 'admin';
    });
    document.getElementById('inviteUserForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await callTeamAdmin({
          action: 'invite-user',
          fullName: document.getElementById('inviteName').value.trim(),
          email: document.getElementById('inviteEmail').value.trim(),
          role: document.getElementById('inviteRole').value,
          employeeId: document.getElementById('inviteEmployee').value
        });
        showToast('Invitación enviada');
        await openUserManagement();
      } catch (inviteError) {
        showToast(inviteError.message, 'error');
      } finally {
        button.disabled = false;
      }
    });
    document.querySelectorAll('[data-save-user]').forEach(button => button.addEventListener('click', async () => {
      const id = button.dataset.saveUser;
      const selectedRole = document.querySelector(`[data-user-role="${CSS.escape(id)}"]`).value;
      const employeeId = document.querySelector(`[data-user-employee="${CSS.escape(id)}"]`).value;
      try {
        await callTeamAdmin({ action: 'update-user', userId: id, role: selectedRole, employeeId, isActive: true });
        showToast('Usuario actualizado');
        await openUserManagement();
      } catch (updateError) {
        showToast(updateError.message, 'error');
      }
    }));
    document.querySelectorAll('[data-toggle-user]').forEach(button => button.addEventListener('click', async () => {
      const id = button.dataset.toggleUser;
      const current = profiles.find(profile => profile.id === id);
      const isActive = !current.is_active;
      if (!confirm(`¿Quieres ${isActive ? 'reactivar' : 'desactivar'} la cuenta de ${current.full_name}?`)) return;
      const selectedRole = document.querySelector(`[data-user-role="${CSS.escape(id)}"]`).value;
      const employeeId = document.querySelector(`[data-user-employee="${CSS.escape(id)}"]`).value;
      try {
        await callTeamAdmin({ action: 'update-user', userId: id, role: selectedRole, employeeId, isActive });
        showToast(`Usuario ${isActive ? 'reactivado' : 'desactivado'}`);
        await openUserManagement();
      } catch (updateError) {
        showToast(updateError.message, 'error');
      }
    }));
  } catch (error) {
    console.error('[Usuarios] No se pudo cargar gestión:', error);
    showToast(`No se pudieron cargar los usuarios: ${error.message}`, 'error');
  }
};

const originalConfigurationRenderer = window.render_configuracion;
window.render_configuracion = async function(container, arg) {
  await originalConfigurationRenderer(container, arg);
  if (!window.isAdmin()) return;
  const card = document.createElement('section');
  card.className = 'card user-management-entry';
  card.innerHTML = '<div class="card-header"><h3>Usuarios y permisos</h3></div><div class="card-body"><p>Invita al equipo, vincula técnicos a Empleados y administra roles y cuentas.</p><button class="btn btn-primary" type="button" id="openUserManagement"><i class="fas fa-user-shield"></i> Gestionar usuarios</button></div>';
  container.prepend(card);
  card.querySelector('#openUserManagement').addEventListener('click', window.openUserManagement);
};

const originalBudgetRenderer = window.render_presupuestos;
window.render_presupuestos = async function(container, arg) {
  if (window.isTechnician()) return window.renderTechnicianRequests(container);
  await originalBudgetRenderer(container, arg);
  if (window.isAdmin()) {
    const header = container.querySelector('.page-header .header-actions');
    if (header) {
      const button = document.createElement('button');
      button.className = 'btn btn-outline';
      button.type = 'button';
      button.innerHTML = '<i class="fas fa-box-open"></i> Solicitudes de material';
      button.addEventListener('click', window.openAdminMaterialRequests);
      header.prepend(button);
    }
  }
};

const originalWarehouseRenderer = window.render_almacen;
window.render_almacen = async function(container, arg) {
  if (window.isTechnician()) return window.renderTechnicianWarehouse(container);
  return originalWarehouseRenderer(container, arg);
};

const originalDashboardRenderer = window.render_dashboard;
window.render_dashboard = async function(container, arg) {
  if (window.isTechnician()) return window.renderTechnicianDashboard(container);
  return originalDashboardRenderer(container, arg);
};

window.renderTechnicianParts = async function(container) {
  const parts = await dbGetAll('partesTrabajo');
  container.innerHTML = `
    <div class="page-header"><div><h2>Partes de trabajo</h2><p>Consulta los partes del equipo y gestiona los tuyos.</p></div><button class="btn btn-primary" id="newTechnicianPart"><i class="fas fa-plus"></i> Nuevo parte</button></div>
    <div class="search-bar"><input type="search" id="technicianPartSearch" placeholder="Buscar parte, cliente o trabajo"></div>
    <div class="card"><div class="table-wrapper"><table><thead><tr><th>Parte</th><th>Cliente</th><th>Ubicación</th><th>Técnico</th><th>Trabajo</th><th>Kms</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead><tbody id="technicianPartRows"></tbody></table></div></div>`;
  const paint = () => {
    const query = container.querySelector('#technicianPartSearch').value.toLocaleLowerCase('es').trim();
    const filtered = parts.filter(part => [
      part.id, part.clienteNombre, part.ubicacionNombre, part.empleadoNombre,
      part.tipoPuerta, part.descripcion, part.estado, part.fecha
    ].join(' ').toLocaleLowerCase('es').includes(query));
    container.querySelector('#technicianPartRows').innerHTML = filtered.map(part => {
      const own = String(part.createdBy) === String(window.authState.user.id);
      const actions = own
        ? `<button type="button" class="btn btn-outline btn-sm" data-action="edit-parte" data-id="${authEscape(part.id)}" title="Editar mi parte"><i class="fas fa-pen"></i></button>
           <button type="button" class="btn btn-outline btn-sm" onclick="generatePDF_partes('${authEscape(part.id)}')" title="Descargar PDF"><i class="fas fa-file-pdf"></i></button>
           <button type="button" class="btn btn-outline btn-sm" onclick="confirmDelete('Parte ${authEscape(part.id)}',()=>deleteParte('${authEscape(part.id)}'))" title="Eliminar mi parte"><i class="fas fa-trash"></i></button>`
        : '<span class="muted">Solo lectura</span>';
      return `<tr><td><strong>${authEscape(part.id)}</strong></td><td>${authEscape(part.clienteNombre)}</td><td>${authEscape(part.ubicacionNombre || '—')}</td><td>${authEscape(part.empleadoNombre || '—')}</td><td>${authEscape(part.tipoPuerta || part.descripcion || '—')}</td><td>${authEscape(part.kms || 0)} km</td><td><span class="badge ${authEscape(getBadgeClass(part.estado))}">${authEscape(getStatusLabel(part.estado))}</span></td><td>${authEscape(formatDate(part.fecha))}</td><td class="actions-cell">${actions}</td></tr>`;
    }).join('') || '<tr><td colspan="9">No hay partes que coincidan.</td></tr>';
  };
  container.querySelector('#newTechnicianPart').addEventListener('click', () => window.showParteForm());
  container.querySelector('#technicianPartSearch').addEventListener('input', paint);
  paint();
};

const originalPartPage = window.render_partesTrabajo;
window.render_partesTrabajo = async function(container, arg) {
  if (window.isTechnician()) return window.renderTechnicianParts(container);
  return originalPartPage(container, arg);
};

const originalShowPartForm = window.showParteForm;
window.showParteForm = async function(id) {
  if (window.isTechnician() && id) {
    const part = await dbGet('partesTrabajo', id);
    if (!part || String(part.createdBy) !== String(window.authState.user.id)) {
      return showToast('Solo puedes editar tus propios partes.', 'error');
    }
  }
  if (window.isTechnician() && !window.authState.employee) {
    return showToast('Tu cuenta no está vinculada a un empleado. Contacta con administración.', 'error');
  }
  await originalShowPartForm(id);
  if (!window.isTechnician()) return;
  const employeeSelect = document.getElementById('pt_empleado');
  if (employeeSelect) {
    employeeSelect.value = window.authState.employee.id;
    employeeSelect.disabled = true;
  }
  const kmsInput = document.getElementById('pt_kms');
  if (kmsInput) {
    kmsInput.readOnly = true;
    const unlock = document.createElement('button');
    unlock.type = 'button';
    unlock.className = 'btn btn-outline btn-sm kms-unlock';
    unlock.innerHTML = '<i class="fas fa-lock"></i> Corregir kilómetros';
    unlock.addEventListener('click', () => {
      kmsInput.readOnly = !kmsInput.readOnly;
      unlock.innerHTML = kmsInput.readOnly
        ? '<i class="fas fa-lock"></i> Corregir kilómetros'
        : '<i class="fas fa-lock-open"></i> Bloquear kilómetros';
      if (!kmsInput.readOnly) kmsInput.focus();
    });
    kmsInput.insertAdjacentElement('afterend', unlock);
  }
};

const originalSavePart = window.saveParte;
window.saveParte = async function(id) {
  if (window.isTechnician()) {
    const employee = window.authState.employee;
    const employeeSelect = document.getElementById('pt_empleado');
    if (!employee || !employeeSelect) return showToast('No se ha podido asignar el técnico a este parte.', 'error');
    employeeSelect.value = employee.id;
  }
  return originalSavePart(id);
};

const originalDeletePart = window.deleteParte;
window.deleteParte = async function(id) {
  if (window.isTechnician()) {
    const part = await dbGet('partesTrabajo', id);
    if (!part || String(part.createdBy) !== String(window.authState.user.id)) {
      return showToast('Solo puedes eliminar tus propios partes.', 'error');
    }
  }
  return originalDeletePart(id);
};
