# FILA CERO — Sistema de Turnos Virtuales

FILA CERO es una aplicación web para solicitar y gestionar turnos de atención de forma digital. Permite a los usuarios pedir su turno desde el navegador, seguir el estado de su espera y recibir notificaciones en tiempo real. El personal de atención dispone de un panel de administración para gestionar la cola y registrar cada atención.

---

Esta guía corresponde a la rama [`deploy/gratis`](https://github.com/JhostynD/proyecto_final/tree/deploy/gratis).

## Problema que resuelve

En muchos puntos de atención presencial los turnos se siguen manejando con papel, fichas o cuadernos físicos. Este sistema centraliza la información en un entorno digital: los usuarios conocen su posición en la fila sin necesidad de estar físicamente presentes, y la entidad conserva un registro completo de cada atención.

---

## Funcionalidades

### Para usuarios registrados

- Registrarse con verificación de correo electrónico (el sistema envía un enlace de confirmación).
- Iniciar sesión con JWT de sesión; recuperación de contraseña mediante enlace seguro por correo.
- Solicitar turno inmediato o cita programada en un servicio disponible.
- Consultar sus turnos activos, posición en la fila y tiempo estimado de espera.
- Cancelar turnos o citas propias.
- Recibir notificaciones en tiempo real (SSE) cuando cambia el estado de un turno.
- Consultar el historial de notificaciones y marcarlas como leídas.

### Para cualquier persona (sin registro)

- Consultar el estado de cualquier turno mediante su código público (sin iniciar sesión).

### Para administradores

- Gestionar la cola: llamar al siguiente turno, asignar módulo de atención, registrar inicio y fin de atención.
- Ver el resumen operativo del día (turnos en espera, atendidos, cancelados).
- Consultar estadísticas históricas por periodo.
- Gestionar cuentas de usuario (activar, desactivar, eliminar).
- Gestionar servicios: crear, editar, activar y desactivar.

---

## Estados de un turno

| Estado | Descripción |
|---|---|
| `pendiente` | Registrado por el usuario, pendiente de confirmación |
| `confirmado` | Cita aprobada en el horario seleccionado |
| `en_espera` | El usuario está esperando ser llamado |
| `llamando` | Se indica al usuario a qué módulo debe acercarse |
| `en_atencion` | El asesor está atendiendo al usuario |
| `completado` | La atención finalizó con éxito |
| `cancelado` | El turno fue anulado por el usuario o el personal |
| `no_presentado` | El usuario fue llamado pero no se presentó |

---

## Roles de usuario

| Rol | Acceso |
|---|---|
| `usuario` | Panel propio, turnos, notificaciones |
| `admin` | Todo lo anterior más gestión de cola, usuarios, servicios y estadísticas |

---

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | React 19, React Router 7, Vite 8 |
| Backend | Node.js, Express 5 |
| Base de datos | **MariaDB 10.4+** (compatible con MySQL 8.0+) |
| Autenticación | JWT con revocación individual (jti) y versión de sesión (auth_version) |
| Notificaciones | Server-Sent Events (SSE) |
| Correo | Nodemailer con SMTP o API de Brevo |

---

## Requisitos previos

- **Node.js 22.13.0 o posterior dentro de la serie 22, o Node.js 24 o posterior**, para ejecutar también el lint con las dependencias bloqueadas. Se verificó el build con Node.js 22.20.0 y npm 10.9.3.
- Git y npm.
- MariaDB 10.4+ o MySQL 8.0+.
- Para enviar correos de verificación y recuperación, configura un proveedor SMTP o la API de Brevo. La plantilla deja el envío desactivado. Con esa configuración, los usuarios registrados no reciben el enlace de verificación.

---

## Instalación

### 1. Clonar el repositorio

```bash
git clone --branch deploy/gratis --single-branch https://github.com/JhostynD/proyecto_final.git
cd proyecto_final
```

### 2. Instalar dependencias

```bash
# Dependencias del monorepo (script de desarrollo conjunto)
npm ci

# Dependencias del backend
npm ci --prefix backend

# Dependencias del frontend
npm ci --prefix frontend
```

### 3. Configurar la base de datos

Desde la raíz del repositorio, importa el esquema con un usuario autorizado a crear la base. La redirección de este ejemplo funciona en Bash y CMD. En PowerShell puedes abrir el cliente `mysql` y ejecutar `source backend/database.sql;` desde la misma carpeta.

```bash
mysql -u root -p < backend/database.sql
```

Esto crea la base de datos `turnos_db` con las **7 tablas** necesarias y los 5 servicios de ejemplo.

> **Instalaciones existentes (actualización):** Si ya tienes `turnos_db` de una versión anterior,
> aplica las migraciones en orden en lugar de reimportar `database.sql`:
>
> ```bash
> mysql -u root -p turnos_db < backend/migracion_seguridad_001.sql
> mysql -u root -p turnos_db < backend/migracion_notificaciones_002.sql
> mysql -u root -p turnos_db < backend/migracion_correo_003.sql
> ```
>
> Antes de migrar, comprueba el motor, la versión y el esquema de destino. Conserva un respaldo y prueba primero sobre una copia aislada.

### 4. Configurar variables de entorno del backend

```bash
cp backend/.env.example backend/.env
```

En PowerShell, usa `Copy-Item backend/.env.example backend/.env`. La plantilla contiene valores de ejemplo para alojamiento. Para desarrollo local, cambia `NODE_ENV` a `development`, apunta a tu base local y ajusta TLS a esa conexión. Sustituye los valores de ejemplo y guarda las credenciales solo en el entorno correspondiente.

| Variable | Descripción |
|---|---|
| `NODE_ENV`, `PORT` | Modo de ejecución y puerto de la API (3000 de forma predeterminada) |
| `DB_HOST` | Host de MariaDB (normalmente `localhost`) |
| `DB_PORT` | Puerto de MariaDB (normalmente `3306`) |
| `DB_NAME` | Nombre de la base de datos (`turnos_db`) |
| `DB_USER` | Usuario de MariaDB |
| `DB_PASSWORD` | Contraseña del usuario de la base de datos |
| `DB_SSL` | Con `true`, el pool usa TLS y valida el certificado |
| `JWT_SECRET` | Clave secreta para firmar los tokens JWT — **debe ser larga y aleatoria** |
| `FRONTEND_URL` | URL del frontend (por defecto `http://localhost:5173`) |
| `CORS_ORIGINS` | Orígenes autorizados para el frontend |
| `EMAIL_ENABLED` | `true` para activar el envío de correos, `false` para desactivarlo |
| `SMTP_HOST` | Servidor SMTP |
| `SMTP_PORT` | Puerto SMTP (587 para STARTTLS) |
| `SMTP_SECURE` | Activa TLS directo para SMTP cuando se establece en `true` |
| `SMTP_USER` | Usuario SMTP |
| `SMTP_PASS` | Contraseña SMTP |
| `EMAIL_FROM` | Dirección de remitente (por ejemplo `no-reply@tudominio.com`) |

Para la API de Brevo, configura `BREVO_API_KEY` y `EMAIL_FROM` con el envío habilitado. El frontend usa `http://localhost:3000/api` por defecto. Para apuntarlo a otra API, define `VITE_API_URL` en el entorno del frontend, con la ruta base terminada en `/api`.

### 5. Crear el primer administrador

Regístrate normalmente desde la aplicación web. Luego, en MariaDB ejecuta:

```sql
USE turnos_db;
UPDATE usuarios SET rol = 'admin', correo_verificado = 1 WHERE correo = 'tu-correo@ejemplo.com';
```

Sustituye el correo de ejemplo por el de la cuenta autorizada. Vuelve a iniciar sesión para activar los permisos de administrador.

---

## Ejecución

### Desarrollo (backend y frontend simultáneos)

```bash
npm run dev
```

- Backend disponible en `http://localhost:3000`
- Frontend disponible en `http://localhost:5173`.
- Comprobación de API y base de datos en `http://localhost:3000/api/salud`. La ruta ejecuta `SELECT 1` y devuelve `ok: true` si la consulta se completa.

### Solo backend

```bash
npm run dev:backend
# o bien, desde la carpeta backend:
cd backend && npm run dev
```

### Solo frontend

```bash
npm run dev:frontend
# o bien, desde la carpeta frontend:
cd frontend && npm run dev
```

### Build de producción del frontend

```bash
npm run build
# Los archivos estáticos quedan en frontend/dist/
```

---

## Pruebas y estado de la compilación

```bash
npm run build
npm run lint
npm --prefix backend test
```

Para la suite del backend, usa una base aislada con el esquema del proyecto y configura `DB_NAME_TEST`, `DB_HOST_TEST`, `DB_PORT_TEST`, `DB_USER_TEST` y `DB_PASSWORD_TEST`. El nombre de la base debe incluir `test` y ser distinto de `DB_NAME`. La suite usa el puerto definido por `TEST_PORT` o `PORT`.

En la revisión [`329e982`](https://github.com/JhostynD/proyecto_final/tree/329e982483defe0e608f495ed47c780043b88733), el frontend compiló con Vite 8.3.5. ESLint reportó un error de `react-hooks/set-state-in-effect` en `frontend/src/pages/Home.jsx:29`. La suite del backend quedó pendiente de ejecución.

## Configuración para despliegue

- **Frontend.** Usa `frontend` como directorio del proyecto. Configura `VITE_API_URL` antes de compilar y publica el contenido generado en `frontend/dist/`. El archivo `frontend/vercel.json` redirige las rutas de la aplicación a `index.html`.
- **API.** Inicia el servicio con `npm start` desde `backend`. Configura las variables del entorno, incluido el origen del frontend, y comprueba `GET /api/salud` después del arranque.
- **Base de datos.** Configura el host, puerto, usuario y TLS según el servicio elegido. En producción, el código exige nombre de base de datos, contraseña y un usuario válido distinto de `root` sin prefijo.

Los dominios de Vercel y Render y los parámetros de TiDB Cloud que aparecen en las plantillas son ejemplos de configuración. Las URLs del entorno publicado quedan por confirmar.

## Estructura del proyecto

```
proyecto_final/
├── backend/
│   ├── src/
│   │   ├── server.js          — Servidor Express; todas las rutas de la API
│   │   ├── auth.js            — JWT, autenticación, rate limiting, revocación
│   │   ├── db.js              — Pool de conexiones a MariaDB
│   │   ├── email.js           — Envío de correos transaccionales
│   │   ├── notificaciones.js  — SSE: conexiones en tiempo real (límite 5/usuario)
│   │   └── festivos_colombia.js — Cálculo de días hábiles (Ley 51 de 1983)
│   ├── database.sql           — Esquema completo para instalación nueva
│   ├── migracion_seguridad_001.sql     — Columna activo + sesiones_revocadas
│   ├── migracion_notificaciones_002.sql — Tabla notificaciones
│   ├── migracion_correo_003.sql        — Verificación de correo + recuperación de contraseña
│   ├── .env.example           — Plantilla de variables de entorno
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/             — Páginas React (15 páginas)
│   │   ├── components/        — Componentes reutilizables
│   │   ├── lib/api.js         — Cliente HTTP centralizado con manejo de sesión
│   │   └── App.jsx            — Enrutamiento principal
│   └── package.json
├── docs/                      — Informes técnicos de auditoría y migración
├── package.json               — Scripts del monorepo (dev, build, lint)
└── README.md
```

---

## API — Endpoints principales

Todas las rutas privadas requieren la cabecera `Authorization: Bearer <token>`.
Las rutas de administración requieren además rol `admin`.

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/api/salud` | Comprobar la API y su conexión a la base | Público |
| `POST` | `/api/auth/registro` | Registrar nueva cuenta | Público |
| `POST` | `/api/auth/login` | Iniciar sesión | Público |
| `GET` | `/api/auth/verificar-correo?token=...` | Verificar correo | Público |
| `POST` | `/api/auth/reenviar-verificacion` | Reenviar correo de verificación | Público |
| `POST` | `/api/auth/olvide-contrasena` | Solicitar recuperación de contraseña | Público |
| `POST` | `/api/auth/restablecer-contrasena` | Restablecer contraseña | Público |
| `POST` | `/api/auth/logout` | Cerrar sesión (revoca token) | Autenticado |
| `GET` | `/api/auth/perfil` | Obtener perfil del usuario | Autenticado |
| `GET` | `/api/servicios` | Listar servicios disponibles | Público |
| `GET` | `/api/turnos/publico/:codigo` | Consultar turno por código | Público |
| `GET` | `/api/turnos/disponibilidad?fecha=...&servicioId=...` | Horarios disponibles | Autenticado |
| `GET` | `/api/turnos` | Listar turnos propios | Autenticado |
| `POST` | `/api/turnos` | Solicitar turno o cita | Autenticado |
| `PATCH` | `/api/turnos/:id/cancelar` | Cancelar turno propio | Autenticado |
| `PATCH` | `/api/turnos/:id/checkin` | Realizar check-in | Autenticado |
| `GET` | `/api/notificaciones/stream` | Suscribirse a notificaciones SSE | Autenticado |
| `GET` | `/api/notificaciones` | Historial de notificaciones | Autenticado |
| `PATCH` | `/api/notificaciones/leer-todas` | Marcar todas como leídas | Autenticado |
| `GET` | `/api/admin/resumen` | Resumen operativo del día | Admin |
| `GET` | `/api/admin/estadisticas` | Estadísticas históricas | Admin |
| `GET` | `/api/admin/cola` | Cola de espera actual | Admin |
| `POST` | `/api/admin/cola/llamar-siguiente` | Llamar siguiente turno | Admin |
| `PATCH` | `/api/admin/turnos/:id` | Gestionar estado de un turno | Admin |
| `GET` | `/api/admin/usuarios` | Listar usuarios | Admin |
| `PATCH` | `/api/admin/usuarios/:id/estado` | Activar/desactivar usuario | Admin |
| `DELETE` | `/api/admin/usuarios/:id` | Eliminar usuario | Admin |
| `GET` | `/api/admin/servicios` | Listar servicios | Admin |
| `POST` | `/api/admin/servicios` | Crear servicio | Admin |
| `PATCH` | `/api/admin/servicios/:id` | Editar servicio | Admin |
| `PATCH` | `/api/admin/servicios/:id/estado` | Activar/desactivar servicio | Admin |

---

## Seguridad implementada

- **JWT con jti único** — Cada token tiene un identificador de sesión irrepetible.
- **Revocación de sesiones** — El logout inscribe el `jti` en `sesiones_revocadas`; el backend lo valida en cada petición.
- **auth_version** — Al restablecer la contraseña se incrementa un contador en la BD que invalida todos los JWT anteriores del usuario.
- **Verificación de correo** — Los nuevos registros no pueden iniciar sesión hasta confirmar su dirección.
- **Cabeceras de seguridad HTTP** — Helmet configura `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y más.
- **Rate limiting** — Límites por IP en login, registro, reenvío de verificación y recuperación de contraseña.
- **Límite SSE** — Máximo 5 conexiones simultáneas por usuario (HTTP 429 en la 6ª).
- **Protección IDOR** — Todas las consultas de datos propios usan el `id` del JWT, nunca un parámetro de URL.
- **Reservas concurrentes** — `SELECT ... FOR UPDATE` en transacciones InnoDB para evitar duplicados en cupos de horario.

---

## Notas adicionales

- Los días festivos de Colombia (Ley 51 de 1983) se excluyen automáticamente de los horarios disponibles.
- El proyecto no tiene asociada ninguna entidad real; los servicios de ejemplo son ficticios (caso de estudio financiero).

---

## Contexto académico

- **Programa:** Tecnología en Análisis y Desarrollo de Software (ADSO)
- **Ficha:** 3169892
- **Centro:** SENA CTMA — Regional Antioquia
-Integrantes del equipo:

Jhostyn David Sanchez Asprilla

Miguel Angel Loaisa Monsalve
