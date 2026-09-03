# API Sistema de Gestión de Turnos

- **URL de Producción (Render):** https://proyecto-final-4-2ps6.onrender.com
- **Documentación Swagger Pública:** https://proyecto-final-4-2ps6.onrender.com/docs
- **Endpoint de Salud (Health Check):** https://proyecto-final-4-2ps6.onrender.com/health

---

## ⚠️ Limitaciones Conocidas en Producción
1. **Arranque en frío (Spin down):** Al estar hospedado en la capa gratuita de Render, la instancia se suspende tras 15 minutos de inactividad. La primera petición que se realice después de ese tiempo puede tardar cerca de 1 minuto en responder mientras el servidor enciende.
2. **Almacenamiento Efímero (SQLite):** El sistema de archivos de Render es temporal en la capa gratuita. Cada vez que el servidor se reinicia o se despliega una nueva versión de la aplicación, los datos almacenados en la base de datos SQLite se resetean.

## 1. ¿Qué problema resuelve?

Hoy, en un punto de atención al público, los turnos se manejan con papel o
un cuaderno. Nadie sabe qué módulo atendió a cada persona, ni queda
registro de las observaciones de esa atención.

Esta API resuelve eso guardando todo en una base de datos, con dos cosas
principales conectadas entre sí:

- **Turno**: cuando alguien pide ser atendido (tiene número, nombre del
  cliente y estado: pendiente, atendido, cancelado).
- **Atención**: el registro de que un módulo específico atendió ese turno,
  con fecha y observaciones.

**Para quién es:** operadores de un punto de atención (como en un banco o
una EPS) que necesitan un registro ordenado y consultable.

**Qué no incluye (versión 2, a futuro):** notificaciones por celular,
pantalla pública mostrando el turno actual, reportes de estadísticas,
varias sucursales.

## 2. Cómo instalar y ejecutar el proyecto

```bash
cd backend_fastapi
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Con el servidor corriendo, se puede probar todo desde:
`http://127.0.0.1:8000/docs`

## 3. Tabla de endpoints (todas las rutas que expone la API)

| Método | Ruta | ¿Qué hace? | ¿Quién puede usarla? |
|---|---|---|---|
| POST | /usuarios/registro | Crea un usuario nuevo | Cualquiera |
| POST | /usuarios/login | Inicia sesión y da un token | Cualquiera |

| GET | /usuarios/ | Lista todos los usuarios | Solo admin |
| GET | /usuarios/me | Muestra mi propio perfil | Usuario con sesión |

| PUT | /usuarios/{id} | Edita un usuario | Solo admin |
| DELETE | /usuarios/{id} | Elimina un usuario | Solo admin |

| GET | /turnos | Lista todos los turnos | Cualquiera |
| GET | /turnos/{id} | Muestra un turno específico | Cualquiera |

| POST | /turnos | Crea un turno nuevo | Usuario con sesión |
| PUT | /turnos/{id} | Edita un turno | Usuario con sesión |

| DELETE | /turnos/{id} | Elimina un turno | Solo admin |
| GET | /turnos/{id}/atenciones | Muestra un turno con sus atenciones juntas | Cualquiera |

| GET | /atenciones | Lista todas las atenciones | Cualquiera |
| GET | /atenciones/{id} | Muestra una atención específica | Cualquiera |

| POST | /atenciones | Registra una atención nueva | Usuario con sesión |
| PUT | /atenciones/{id} | Edita una atención | Usuario con sesión |

| DELETE | /atenciones/{id} | Elimina una atención | Solo admin |

Por qué existen 3 niveles de permiso:
- Cualquiera: para que se pueda consultar información sin necesidad de
  cuenta (transparencia).
- Usuario con sesión: para operar el día a día (crear/editar turnos y
  atenciones), pero identificando quién lo hizo.
- Solo admin: para acciones delicadas como borrar información o
  gestionar usuarios, que no cualquiera debería poder hacer.

## 4. Reglas de seguridad que sí o sí se cumplen

- No se puede crear una atención para un turno que no existe (da error 400).
- No se puede borrar un turno que ya tiene atenciones registradas (da error 400).
- No se puede registrar dos veces el mismo correo (da error 400).
- Si no envías tu token de sesión en una ruta protegida, da error 401.
- Si un usuario normal intenta usar una ruta de admin, da error 403.
- Si pides algo que no existe (por ejemplo un turno con id 999), da error 404.

## 5. Usuarios de ejemplo para probar

| Correo | Contraseña | Rol |
|---|---|---|
| admin@correo.com | admin123 | admin |
| user@correo.com | user123 | usuario |

## 6. Cómo están conectadas las tablas (modelo relacional)

```
usuarios
(no está conectada a las otras dos, es independiente)

turnos  ──── un turno puede tener muchas atenciones ────>  atenciones
  id                                                          id
  numero                                                      turno_id (conecta con turnos.id)
  nombre_cliente                                              modulo
  estado                                                      fecha_atencion
  fecha_creacion                                              observacion
```

En palabras simples: cada atención "le pertenece" a un turno. Un turno
puede tener cero, una o varias atenciones. Por eso `atenciones` tiene el
campo `turno_id`, que apunta al turno al que corresponde.

## 7. Ejemplo de flujo completo (para explicar en la sustentación)

1. Un usuario se registra → `POST /usuarios/registro`
2. Inicia sesión y recibe un token → `POST /usuarios/login`
3. Con ese token, crea un turno nuevo → `POST /turnos`
4. Con ese mismo token, registra que un módulo atendió ese turno →
   `POST /atenciones`
5. Cualquiera puede consultar el turno junto con su historial de
   atenciones → `GET /turnos/{id}/atenciones`
6. Solo un administrador puede borrar el turno o eliminar usuarios.
