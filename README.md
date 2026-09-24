# Home Finanzas

Primera entrega: interfaz adaptable, acceso con usuario y PIN en Supabase, fondos, gastos, reservas individuales y resumen por categoría. Incluye demostración temporal con datos ficticios.

## Desarrollo

```sh
npm ci
cp .env.example .env.local
npm run dev
```

La configuración pública del proyecto está en `public/config.json`. Puede sobreescribirse con `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca usar una clave secret/service_role ni contraseña de PostgreSQL en estas variables.

```sh
npm test
npm run build
```

## Cloudflare Pages

Conectar este repositorio, seleccionar la rama `main`, comando `npm run build` y directorio de salida `dist`. El proyecto conectado puede usar `public/config.json` sin configurar variables adicionales. Usar Node 22.12+ o 24. Configurar en Supabase Auth la URL final de la aplicación. El sitio se publica en Cloudflare Pages.

## Base de datos y cuentas

`supabase/schema.sql` documenta el esquema inicial aplicado al proyecto. No volver a ejecutarlo sobre una base ya inicializada. RLS limita las filas a las membresías del hogar y no permite crear membresías desde el navegador.

La activación se realiza con un enlace privado de un solo uso, válido durante 48 horas. La URL usa un fragmento que no se envía al servidor de Cloudflare. Al abrirlo se elimina de la barra de direcciones. El usuario elige y confirma su PIN; nunca se incluye en el repositorio.

`supabase/pin-access.sql` documenta las tablas privadas y funciones de acceso. `supabase/functions/pin-auth` comprueba las credenciales en el servidor y entrega una sesión normal de Supabase; las políticas RLS siguen aplicándose a los datos financieros. La función usa las variables estándar del servidor de Supabase, nunca una clave privilegiada del cliente.

El PIN tiene cuatro números y se almacena como hash bcrypt. Hay bloqueo de 15 minutos tras cinco fallos consecutivos, aumentando progresivamente hasta 24 horas. El contador se procesa bajo bloqueo de fila para evitar intentos concurrentes sin límite. El acceso inicial requiere una invitación de alta entropía. Una cuenta conocida todavía puede ser bloqueada deliberadamente por un tercero: el PIN corto mantiene esta limitación.

El endpoint público solo emite sesiones después de comprobar el PIN o el enlace de activación. Las funciones SQL de PIN únicamente pueden ser invocadas por el rol de servidor. El aprovisionamiento inicial está protegido por un token de un solo uso y ya queda cerrado tras configurar las cuentas.

Configuración → Cambiar mi PIN solicita el PIN actual y el nuevo. Mantener sesión es opcional: localStorage para persistencia o sessionStorage para la pestaña actual. Nunca se guarda el PIN en el navegador. El cambio de PIN no revoca automáticamente sesiones abiertas en otros dispositivos.

Si se pierde el PIN, la recuperación requiere intervención administrativa y un enlace nuevo; no hay recuperación pública por nombre de usuario. Correos internos aleatorios permiten usar Supabase Auth sin pedir correo al usuario ni enviar mensajes.

Ningún dato financiero real debe guardarse en el repositorio. El histórico anterior a la fecha de conciliación todavía no se admite en la captura normal.

## Alcance y limitaciones de esta entrega

- Reservar no crea un gasto; pagar una reserva crea un gasto vinculado y deja de considerarla pendiente.
- Un índice único impide pagar dos veces la misma reserva. Cada formulario reutiliza un UUID durante reintentos.
- Gastos y reservas son registros de solo adición; correcciones y cancelaciones vendrán en la siguiente entrega.
- Los datos se actualizan al entrar, guardar, recuperar conexión y volver a la pestaña; la sincronización Realtime todavía no está implementada.
- Pendiente: configuración editable, recibos variables, recurrencias, calendario y cierres, ahorro, inventario, carrito compartido, instalación PWA y notificaciones.
- La demostración vive en memoria; no usarla para capturar gastos reales.
- No hay modo offline de escritura ni registro público de cuentas.

## Verificación de esta entrega

Compilación y cuatro pruebas unitarias de importes, reservas, aislamiento de cálculos por fondo y restricciones de vales. Esquema remoto confirmado: RLS activo en las cinco tablas y sin lectura anónima; revisión de seguridad de Supabase sin advertencias después de restringir una función interna preexistente (`supabase/hardening.sql`). La validación de integración se realiza mediante el API real con una cuenta temporal, que se elimina al terminar.

## Verificación del acceso con PIN

Siete pruebas unitarias y compilación correctas. Quince comprobaciones contra el API desplegado, usando una cuenta temporal posteriormente eliminada: activación, rechazo de reutilización del enlace, aislamiento de hogares y fondos, rechazo de RPC privado y lectura anónima, escritura de reserva, rechazo de efectivo en vales, pago vinculado, rechazo de pago duplicado, cambio de PIN, rechazo del anterior, aceptación del nuevo y bloqueo efectivo tras cinco fallos.

Las tablas del esquema privado son exclusivas del servidor. El asesor de Supabase también informa que la [protección contra contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) está desactivada; las contraseñas internas de Auth se generan aleatoriamente y el PIN se valida en el endpoint propio, con límites de intentos. No se afirma que esa opción de Auth proteja el PIN.

Interfaz verificada en navegador a 1440 px y 390 px: captura de gasto en demo, formulario de PIN, validación de confirmación, activación desde una pestaña ya abierta y eliminación del fragmento del enlace. Sin errores de JavaScript ni desbordamiento horizontal en móvil.
