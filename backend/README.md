# Backend: sistema de turnos

## Instalación

1. Ejecuta `database.sql` en MySQL.
2. Copia `.env.example` a `.env` y configura las credenciales.
3. Ejecuta `npm install` y `npm run dev`.

La API quedará disponible en `http://localhost:3000`.

## Endpoints principales

- `POST /api/auth/registro`, `POST /api/auth/login`, `GET /api/auth/perfil`.
- `GET /api/servicios`.
- `GET /api/turnos`, `POST /api/turnos`, `PATCH /api/turnos/:id/cancelar`.
- `GET /api/turnos/disponibilidad?fecha=AAAA-MM-DD`.
- Admin: `GET /api/admin/resumen`, `GET /api/admin/usuarios`, `PATCH /api/admin/turnos/:id`, `DELETE /api/admin/usuarios/:id`.

Las rutas privadas requieren `Authorization: Bearer <token>`. Para crear el primer administrador, registra una cuenta y ejecuta: `UPDATE usuarios SET rol = 'admin' WHERE correo = 'tu-correo@ejemplo.com';`.
