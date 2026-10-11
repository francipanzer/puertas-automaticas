// Notificaciones push (administradores): activar/desactivar en este dispositivo.
(function () {
  const VAPID_PUBLIC_KEY = 'BCDjIGYgi-KY7RJoeCkTnYBmdrHC51RLPAshZBN008bGqmZMxz0VPMfAxg2Gwj8mSWJ65NyuAYKlSEtZJR1rYH8';

  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  function urlBase64ToUint8Array(base64) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }

  async function getSubscription() {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  async function enable() {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Permiso de notificaciones denegado en el navegador.');
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    const json = sub.toJSON();
    const { error } = await window.supabaseDB.rpc('save_push_subscription', {
      p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth
    });
    if (error) throw error;
  }

  async function disable() {
    const sub = await getSubscription();
    if (!sub) return;
    await window.supabaseDB.rpc('remove_push_subscription', { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  }

  async function refreshButton(button) {
    if (!button) return;
    const sub = await getSubscription().catch(() => null);
    const active = !!sub && Notification.permission === 'granted';
    button.dataset.active = active ? '1' : '0';
    button.innerHTML = active
      ? '<i class="fas fa-bell-slash"></i> Desactivar avisos en este dispositivo'
      : '<i class="fas fa-bell"></i> Activar avisos en este dispositivo';
  }

  window.initPushButton = function () {
    const button = document.getElementById('pushToggle');
    if (!button) return;
    if (!supported() || !(window.isAdmin?.() || window.isTechnician?.())) { button.hidden = true; return; }
    button.hidden = false;
    refreshButton(button);
    button.onclick = async () => {
      button.disabled = true;
      try {
        if (button.dataset.active === '1') { await disable(); showToast('Avisos desactivados en este dispositivo'); }
        else { await enable(); showToast('Avisos activados en este dispositivo'); }
      } catch (err) {
        console.error(err);
        showToast(err.message || 'No se pudo cambiar el aviso', 'error');
      } finally {
        button.disabled = false;
        refreshButton(button);
      }
    };
  };

  // Al tocar una notificación: ir a la pantalla correspondiente
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data && e.data.type === 'valgom-navigate' && e.data.page && window.canAccessPage?.(e.data.page)) {
        window.navigateTo?.(e.data.page);
      }
    });
  }
  window.addEventListener('valgom:authenticated', () => {
    const page = new URLSearchParams(location.search).get('page');
    if (page && window.canAccessPage?.(page)) {
      history.replaceState(null, '', location.pathname);
      window.navigateTo?.(page);
    }
  });
})();
