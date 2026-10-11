# Despliegue de acceso y roles

La aplicación de navegador no contiene la clave `service_role`. Las operaciones administrativas se realizan exclusivamente mediante la Edge Function `team-admin`.

## Antes de desplegar

1. Haz una copia de seguridad de las tablas de Supabase.
2. Comprueba que `partes_trabajo` es la tabla de partes que usa la aplicación. El formulario espera sus columnas de empleado, ubicación, DNI, fotos y firmas; `partesTrabajo` es una tabla distinta y no contiene esos campos.
3. Ejecuta `SUPABASE_AUTH_ROLES.sql` en el SQL Editor.
4. Confirma que la migración termina sin errores antes de desplegar el cliente nuevo. La migración activa RLS y revoca el acceso anónimo a los datos.

La migración elimina las políticas abiertas actuales de las tablas de la aplicación. Desde ese momento, la versión anterior dejará de acceder a esos datos; despliega `team-admin` y la interfaz actualizada inmediatamente después. No ejecutes el SQL sin una copia de seguridad y tiempo para completar estos pasos.

La tabla `partes_trabajo` usa un ID `bigint` generado por la secuencia de PostgreSQL. La aplicación omite el ID al crear un parte y utiliza el ID devuelto por Supabase; por ello, crear un parte requiere conexión.

## Desplegar la función

Desde la raíz del proyecto, con Supabase CLI autenticado y el proyecto enlazado:

```powershell
npx.cmd supabase@latest functions deploy team-admin --project-ref ziimllianelsocrdeeut --no-verify-jwt
```

Supabase proporciona `SUPABASE_URL` y las claves del proyecto al entorno de Edge Functions. El único secreto adicional necesario para el primer administrador es `ADMIN_BOOTSTRAP_CODE`, que se configura en Dashboard → Edge Functions → Secrets. Nunca pongas la clave `service_role` ni el código de activación en `index.html`, JavaScript del cliente, Git o una captura pública.

La función comprueba el token de sesión en cada operación administrativa y el SQL permite consumir el bootstrap una sola vez. Tras crear la primera cuenta administradora, elimina el secreto `ADMIN_BOOTSTRAP_CODE`:

```powershell
npx.cmd supabase@latest secrets unset ADMIN_BOOTSTRAP_CODE --project-ref ziimllianelsocrdeeut
```

El primer administrador podrá invitar a los otros administradores y técnicos desde Configuración. Supabase Auth debe tener configurado el envío de invitaciones y recuperación de contraseña para el equipo.

## Activación

Después de migrar SQL y desplegar la función, publica/recarga la aplicación. La pantalla inicial ofrecerá la creación del administrador mientras no exista ninguno; después solo mostrará el inicio de sesión.

## Funciones incluidas

- Inicio de sesión por cuenta, restablecimiento de contraseña e invitaciones gestionadas por administración.
- Panel de usuarios en Configuración para asignar rol, ficha de empleado y activar/desactivar cuentas.
- Cada usuario activo puede corregir su correo de acceso desde el pie de la barra lateral; el cambio se sincroniza entre Supabase Auth y su perfil.
- Perfiles técnicos con acceso a partes, solicitudes de material, informes de kilómetros, revisiones, consulta segura de almacén y Ayuda.
- La solicitud de material no incluye precios; al convertirla se crea un presupuesto en borrador para que oficina complete la valoración.
- Los cambios de permisos de pantalla son solo una capa de UX: RLS y las funciones SQL son los controles efectivos de datos.

La app requiere conexión para crear, modificar o eliminar datos autenticados. Las cachés locales y la cola pendiente anterior se limpian al cambiar o cerrar la sesión para impedir que otra cuenta del mismo dispositivo herede datos locales. La consulta offline solo puede usar la caché del usuario que sigue autenticado en ese dispositivo.

Antes de publicar la nueva interfaz, valida en un proyecto de pruebas que existen las tablas referenciadas por `SUPABASE_AUTH_ROLES.sql` y que `partesTrabajo` (o `partes_trabajo`) incluye el campo de empleado esperado por la app. La migración habilita RLS únicamente en las tablas conocidas de Valgom y sustituye sus políticas anteriores; revisa cualquier política personalizada de esas tablas antes de ejecutarla.
