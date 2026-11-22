# FILA CERO — Frontend

Interfaz web de FILA CERO construida con **React 19 + Vite 8**.

---

## Requisitos

- Node.js 18 o superior.
- El backend de FILA CERO en ejecución (por defecto en `http://localhost:3000`).

---

## Instalación

```bash
cd frontend
npm install
```

---

## Variables de entorno

El frontend no requiere un archivo `.env` propio para el entorno local: la URL del backend
(`http://localhost:3000`) está configurada como valor por defecto en `src/lib/api.js`.

Para apuntar a un backend diferente (por ejemplo, en producción), crea `frontend/.env`:

```
VITE_API_URL=https://tu-dominio.com
```

---

## Ejecución en desarrollo

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`.

> Asegúrate de que el backend esté corriendo antes de usar la aplicación.

---

## Compilación de producción

```bash
npm run build
```

Los archivos estáticos se generarán en `frontend/dist/`. Pueden servirse con cualquier
servidor web estático (Nginx, Netlify, Cloudflare Pages, etc.).

Para previsualizar el build localmente:

```bash
npm run preview
```

---

## Conexión con el backend

Todas las peticiones HTTP se realizan a través de `src/lib/api.js`. Este módulo:

- Añade automáticamente el token JWT de sesión en la cabecera `Authorization: Bearer <token>`.
- Gestiona el cierre de sesión local cuando el backend devuelve `401`.
- Redirige al login cuando la sesión expira.

---

## Páginas disponibles

| Ruta | Descripción | Acceso |
|---|---|---|
| `/` | Página de inicio | Público |
| `/login` | Inicio de sesión | Público |
| `/registro` | Registro de nueva cuenta | Público |
| `/verificar-correo` | Verificación de correo electrónico | Público (con token) |
| `/olvide-contrasena` | Solicitud de recuperación de contraseña | Público |
| `/restablecer-contrasena` | Restablecimiento de contraseña | Público (con token) |
| `/consulta-turno` | Consulta pública de turno por código | Público |
| `/dashboard` | Panel del usuario: resumen de turnos y notificaciones | Autenticado |
| `/solicitar-turno` | Solicitar un nuevo turno o cita | Autenticado |
| `/consultar-turnos` | Ver y cancelar turnos propios | Autenticado |
| `/admin` | Panel resumen del administrador | Solo administrador |
| `/usuarios` | Gestión de cuentas de usuario | Solo administrador |
| `/servicios` | Gestión de servicios | Solo administrador |
| `/gestion-turnos` | Gestión de la cola de turnos | Solo administrador |

---

## Tecnologías principales

- **React 19** — UI declarativa con hooks.
- **React Router 7** — Enrutamiento del lado del cliente.
- **Vite 8** — Empaquetado y servidor de desarrollo.
- **ESLint** — Análisis estático de código.
