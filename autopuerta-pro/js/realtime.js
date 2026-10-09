// realtime.js — Sincronización en tiempo real entre dispositivos
const REALTIME_TABLES = ['empleados','clientes','partesTrabajo','vehiculos','presupuestos','almacen'];

REALTIME_TABLES.forEach(store => {
  const channel = supabaseDB
    .channel('sync-' + store)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: TABLA[store] || store },
      async (payload) => {
        console.log('[Realtime]', store, payload.eventType, payload.new?.id);
        // Invalidar caché local
        await cacheInvalidate(store);
        // Notificar a la app para repintar
        if (window.__onStoreChanged) {
          window.__onStoreChanged(store, payload);
        }
      }
    )
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        console.log('[Realtime] OK:', store);
      }
    });
});

// Listener global que las páginas pueden usar
window.__onStoreChanged = null;