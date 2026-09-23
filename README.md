# Home Finanzas

Primera entrega: interfaz adaptable, acceso Supabase, fondos, gastos, reservas individuales y resumen por categoría. Incluye demostración temporal con datos ficticios.

## Desarrollo

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` con la URL y clave **publicable** del proyecto. Nunca usar una clave secret/service_role ni contraseña de PostgreSQL en estas variables.

```sh
npm test
npm run build
```

## Cloudflare Pages

Conectar este repositorio, seleccionar la rama `main`, comando `npm run build` y directorio de salida `dist`. Configurar las dos variables anteriores antes de compilar. Usar Node 22.12+ o 24. Configurar en Supabase Auth la URL final de la aplicación. La publicación no se ha ejecutado todavía.

## Base de datos y cuentas

`supabase/schema.sql` documenta el esquema inicial aplicado al proyecto. No volver a ejecutarlo sobre una base ya inicializada. RLS limita las filas a las membresías del hogar y no permite crear membresías desde el navegador.

Habilitación inicial por administración:
1. Crear las dos cuentas en Supabase Auth y vincular sus UUID mediante `memberships` al mismo `households.id`.
2. Registrar fondos y saldos conciliados en `funds`, incluyendo fecha de inicio de cada saldo. Los importes se expresan en centavos.
3. Abrir la aplicación e iniciar sesión. Una cuenta sin membresía no obtiene acceso al hogar.

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

Compilación y cuatro pruebas unitarias de importes, reservas, aislamiento de cálculos por fondo y restricciones de vales. Esquema remoto confirmado: RLS activo en las cinco tablas y sin lectura anónima; revisión de seguridad de Supabase sin advertencias después de restringir una función interna preexistente (`supabase/hardening.sql`). La prueba transaccional con usuarios sintéticos no pudo ejecutarse porque la herramienta SQL opera en modo de solo lectura. Pendiente validar escritura y aislamiento extremo a extremo con cuentas habilitadas antes de uso real.
