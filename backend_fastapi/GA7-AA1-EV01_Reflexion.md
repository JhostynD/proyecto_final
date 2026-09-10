# GA7-AA1-EV01 — Reflexión: de "en mi máquina funciona" a "cualquiera puede usarlo"

**Proyecto:** API Sistema de Gestión de Turnos
**Aprendiz:** Jhostyn David Sánchez Asprilla, Miguel Angel Loaisa Monsalve

## 1. Diferencias entre correr la API en mi computador y en un servidor público

1. **Quién puede llamarla:** en local, solo yo, desde `127.0.0.1`. En producción, cualquier persona con la URL puede hacer peticiones desde cualquier parte del mundo.
2. **Quién puede leer el código:** en mi máquina, solo yo. En GitHub, el repositorio (y su historial completo de commits) es visible para cualquiera que lo encuentre, incluidos los secretos que alguna vez se hayan subido por error.
3. **Cuántas personas la usan a la vez:** en local, una sola conexión (la mía). En producción, múltiples usuarios pueden hacer peticiones simultáneas, lo que expone problemas de concurrencia que en desarrollo nunca aparecen.
4. **Quién reinicia el servidor:** en mi máquina lo reinicio yo cuando quiero. En Render, la plataforma lo reinicia automáticamente en cada despliegue, y también lo suspende sola tras 15 minutos sin tráfico (spin down).
5. **Qué pasa si se cae a las 3 de la mañana:** en local, no importa porque nadie más lo está usando. En producción, un usuario real puede estar intentando acceder y recibir un error sin que yo me entere, a menos que revise los logs.
6. **Dónde quedan los datos:** en mi máquina, `database.db` persiste mientras yo no la borre. En Render (plan gratuito), el disco es efímero: cualquier redespliegue o reinicio borra el archivo y las tablas se reconstruyen vacías (salvo lo que la función de siembra recree).
7. **Quién paga el servicio:** en local, no hay costo. En producción, incluso en el plan gratuito hay límites de recursos, y escalar implica un costo real que alguien debe asumir.
8. **Qué sabe el usuario cuando algo falla:** en local, yo veo el traceback completo en la terminal. En producción, un usuario común solo ve un error genérico (o nada), y solo yo puedo diagnosticar el problema real revisando los logs de Render.

## 2. Auditoría del repositorio propio

**Repositorio auditado:** `https://github.com/JhostynD/proyecto_final`

| Hallazgo | ¿Se encontró? | Nivel de riesgo | Detalle |
|---|---|---|---|
| `SECRET_KEY` escrita directamente en un archivo `.py` | No | — | Desde el inicio del proyecto, `seguridad.py` la lee con `os.getenv("SECRET_KEY")`, cargada vía `python-dotenv`. Nunca estuvo hardcodeada en el código. |
| Archivo `.env` subido al repositorio (estado actual o historial) | No | — | Verificado con `git log --all --full-history -- .env` (y la misma ruta dentro de `backend_fastapi/`): ningún commit devuelto en ninguna rama. Nunca se subió. |
| Archivo `database.db` subido al repositorio (estado actual o historial) | No | — | Verificado con `git log --all --full-history -- database.db` (y la misma ruta dentro de `backend_fastapi/`): ningún commit devuelto en ninguna rama. Nunca se subió. |
| Contraseñas de los usuarios sembrados escritas en el código | **Sí (corregido durante la EV02)** | **Alto** | `database.py` tenía `obtener_password_hash("admin123")` y `obtener_password_hash("user123")` escritos literalmente en `sembrar_datos()`. Cualquiera que viera el repositorio conocía la contraseña del usuario administrador. Se corrigió leyendo ambas contraseñas desde variables de entorno (`ADMIN_PASSWORD`, `USER_PASSWORD`), con `RuntimeError` si no están definidas. |
| CORS mal configurado (`allow_origins=["*"]` junto con `allow_credentials=True`) | **Sí (corregido durante la EV02)** | **Medio** | Esta combinación no es válida según la especificación de CORS —los navegadores la bloquean— y además abre la API a cualquier origen si se combinara con autenticación por cookies. Se corrigió a `allow_credentials=False`, justificado porque la autenticación usa tokens Bearer en el header `Authorization`, no cookies de sesión. |
| Correos, contraseñas de prueba o rutas locales escritas en el código | No | — | No se encontraron rutas absolutas de mi máquina ni datos de prueba fuera de los ya mencionados en la siembra de datos. |

**Conclusión de la auditoría:** el hallazgo más grave era las contraseñas hardcodeadas del usuario administrador. Aunque `SECRET_KEY` estaba bien manejada desde el principio, una contraseña de administrador visible en texto plano en un repositorio público habría anulado por completo la seguridad del sistema de autenticación, sin importar qué tan fuerte fuera la clave de firma JWT.

## 3. El principio de configuración por variables de entorno (Twelve-Factor App, principio III)

El principio III de la metodología Twelve-Factor App establece que la configuración de una aplicación —todo lo que puede variar entre entornos de despliegue (desarrollo, pruebas, producción)— debe vivir **fuera del código fuente**, en variables de entorno, y nunca estar escrita directamente en los archivos del programa ni en archivos de configuración que se suban al control de versiones.

La razón de fondo es que el código debería ser exactamente el mismo en todos los entornos; lo único que cambia es la configuración. Si la configuración estuviera mezclada con el código, cada vez que se necesitara un valor distinto (una clave distinta en producción, por ejemplo) habría que modificar y volver a desplegar el código, lo cual es frágil y peligroso: un desarrollador podría subir por error una clave real a un repositorio público, o usar por accidente una clave de producción en su máquina de desarrollo.

**Ejemplo de mi propio proyecto:** antes de esta guía, `SECRET_KEY` ya se leía desde el entorno, pero las contraseñas de los usuarios sembrados (`admin123`, `user123`) estaban escritas directamente en `database.py`. Esto significaba que el mismo valor de contraseña existía en todos los entornos donde se ejecutara ese código —local, pruebas, producción— y cualquiera con acceso al repositorio lo conocía. Al moverlas a `ADMIN_PASSWORD` y `USER_PASSWORD` leídas con `os.getenv()`, el código quedó idéntico en todos los entornos, pero cada entorno usa sus propios valores: los de mi `.env` local son distintos a los que configuré en el panel de Environment de Render. El código ya no necesita cambiar para que la configuración cambie.

## 4. Predicción del comportamiento de SQLite en Render y alternativas

**Predicción:** como el plan gratuito de Render usa un sistema de archivos efímero, el archivo `database.db` se va a borrar cada vez que el servicio se reinicie o se redespliegue (por ejemplo, cada vez que haga `git push` a la rama conectada). Esto significa que:
- Cualquier turno o atención que se haya creado en producción después del último despliegue se pierde.
- Los usuarios sembrados (`admin`, `user`) se recrean automáticamente gracias a `sembrar_datos()`, porque esa función corre en cada arranque y verifica si las tablas están vacías.
- En la práctica, la base de datos de producción "se resetea" a su estado inicial (dos usuarios y dos turnos de ejemplo) cada vez que hay un nuevo despliegue.

**Dos alternativas para que la demostración siga siendo posible a pesar de esto:**

1. **Documentar la limitación y planificar la demo alrededor de ella:** avisar en el README (ya lo hice en la sección "Limitaciones conocidas") que los datos creados en producción no persisten entre despliegues, y evitar hacer cualquier `git push` justo antes de la sustentación o la feria de proyectos. La demo en vivo crea sus propios datos de prueba en el momento, sin depender de que algo creado antes todavía exista.
2. **Migrar la persistencia a una base de datos gestionada** (por ejemplo PostgreSQL, que Render también ofrece como servicio administrado). Al vivir fuera del contenedor de la aplicación, los datos sobreviven a los reinicios y redespliegues del servicio web. Esta es la solución real a largo plazo, aunque para el alcance de este proyecto no era obligatoria —la guía explícitamente permite convivir con la limitación siempre que se documente y se explique correctamente en la sustentación.
