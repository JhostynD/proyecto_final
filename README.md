# FILA CERO — Sistema de Turnos Virtuales

FILA CERO es una aplicación web para solicitar y gestionar turnos de atención de forma digital. Permite a los usuarios pedir su turno desde el navegador, seguir el estado de su espera y recibir notificaciones en tiempo real. El personal de atención dispone de un panel de administración para gestionar la cola y registrar cada atención.

---

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
| Correo | Nodemailer + SMTP (Brevo u otro proveedor compatible) |

---

## Requisitos previos

- Node.js 18 o superior.
- MariaDB 10.4+ o MySQL 8.0+.
- Una cuenta SMTP para el envío de correos de verificación y recuperación (por ejemplo, [Brevo](https://www.brevo.com/) en su plan gratuito). Sin SMTP configurado, las funcionalidades de verificación de correo y recuperación de contraseña no estarán disponibles, aunque el resto del sistema funcionará.

---

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/JhostynD/proyecto_final.git
cd proyecto_final
```

### 2. Instalar dependencias

```bash
# Dependencias del monorepo (script de desarrollo conjunto)
npm install

# Dependencias del backend
npm install --prefix backend

# Dependencias del frontend
npm install --prefix frontend
```

### 3. Configurar la base de datos

Abre tu cliente de MariaDB/MySQL e importa el esquema completo:

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
> Cada migración usa `IF NOT EXISTS` / `IF NOT EXISTS ADD COLUMN`, por lo que es
> segura de aplicar aunque la columna o tabla ya exista.

### 4. Configurar variables de entorno del backend

```bash
cp backend/.env.example backend/.env
```

Edita `backend/.env` y completa al menos estos valores:

| Variable | Descripción |
|---|---|
| `DB_HOST` | Host de MariaDB (normalmente `localhost`) |
| `DB_PORT` | Puerto de MariaDB (normalmente `3306`) |
| `DB_NAME` | Nombre de la base de datos (`turnos_db`) |
| `DB_USER` | Usuario de MariaDB |
| `DB_PASSWORD` | Contraseña del usuario de MariaDB |
| `JWT_SECRET` | Clave secreta para firmar los tokens JWT — **debe ser larga y aleatoria** |
| `FRONTEND_URL` | URL del frontend (por defecto `http://localhost:5173`) |
| `EMAIL_ENABLED` | `true` para activar el envío de correos, `false` para desactivarlo |
| `SMTP_HOST` | Servidor SMTP |
| `SMTP_PORT` | Puerto SMTP (587 para STARTTLS) |
| `SMTP_USER` | Usuario SMTP |
| `SMTP_PASS` | Contraseña SMTP |
| `EMAIL_FROM` | Dirección de remitente (por ejemplo `no-reply@tudominio.com`) |

### 5. Crear el primer administrador

Regístrate normalmente desde la aplicación web. Luego, en MariaDB ejecuta:

```sql
USE turnos_db;
UPDATE usuarios SET rol = 'admin', correo_verificado = 1 WHERE correo = 'tu-correo@ejemplo.com';
```

Vuelve a iniciar sesión para activar los permisos de administrador.

---

## Ejecución

### Desarrollo (backend y frontend simultáneos)

```bash
npm run dev
```

- Backend disponible en `http://localhost:3000`
- Frontend disponible en `http://localhost:5173`

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
- Las migraciones usan `IF NOT EXISTS` y son idempotentes: se pueden aplicar varias veces sin riesgo.
- El proyecto no tiene asociada ninguna entidad real; los servicios de ejemplo son ficticios (caso de estudio financiero).

---

## Contexto académico

- **Programa:** Tecnología en Análisis y Desarrollo de Software (ADSO)
- **Ficha:** 3169892
- **Centro:** SENA CTMA — Regional Antioquia
-Integrantes del equipo:

Jhostyn David Sanchez Asprilla

Miguel Angel Loaisa Monsalve
