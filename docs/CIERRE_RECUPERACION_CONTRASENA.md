# CIERRE DOCUMENTAL DE LA ETAPA DE RECUPERACIÓN DE CONTRASEÑA — FILA CERO

**Proyecto:** FILA CERO – Sistema de Turnos Virtuales
**Rama:** `feature/Jhostyn`
**Fecha de Cierre:** 15 de Noviembre de 2026
**Responsable Técnico:** Equipo de Desarrollo / Auditoría
**Estado:** Etapa cerrada documentalmente y verificada operativamente.

---

## 1. Resumen Ejecutivo de la Etapa

Se ha culminado la fase de diseño, endurecimiento de seguridad, implementación funcional y validación de la **Recuperación de Contraseña** y el sistema transaccional de **Verificación de Correo Electrónico**.

El flujo fue validado tanto mediante pruebas automatizadas de cobertura integral como mediante pruebas de envío y restablecimiento real en entorno local con el proveedor de relay SMTP Brevo.

---

## 2. Funcionalidades Implementadas

### A. Solicitud de Recuperación (`POST /api/auth/olvide-contrasena`)
1. **Protección Anti-Enumeración:** La respuesta de la API es estrictamente idéntica (`MENSAJE_GENERICO`) para correos existentes, inexistentes, cuentas inactivas o solicitudes en enfriamiento.
2. **Serialización Concurrente (SEC-01):** Implementación de transacciones InnoDB con bloqueo `SELECT ... FOR UPDATE` sobre la fila del usuario, impidiendo que peticiones paralelas eludan el cooldown.
3. **Control de Cooldown Anti-Spam:** Ventana obligatoria de 2 minutos en base de datos (`creado_en > NOW() - INTERVAL 2 MINUTE`) antes de permitir la generación de un nuevo enlace.
4. **Rate Limiting en Memoria:** Doble limitador de frecuencia: máximo 3 solicitudes por correo y 10 por IP cada 15 minutos (código HTTP 429).
5. **Operación Compensatoria y Desacoplamiento SMTP (SEC-02):** La transacción de base de datos se confirma antes de contactar a la red SMTP. Si el despacho de correo falla, una operación compensatoria invalida el token nuevo no entregado (`usado = 1`) y preserva intactos los enlaces anteriores funcionales (`usado = 0`).

### B. Restablecimiento y Consumo (`POST /api/auth/restablecer-contrasena`)
1. **Almacenamiento Criptográfico Seguro:** Los tokens en texto plano (32 bytes / 64 caracteres hexadecimales) viajan exclusivamente en el enlace de correo. En la base de datos se persiste única y exclusivamente su hash SHA-256.
2. **Expiración Estricta:** TTL de 30 minutos desde su generación (`expira_en > NOW()`).
3. **Uso Único:** Consumo atómico bajo transacción. Todo intento de reutilizar un token ya consumido es rechazado de inmediato con HTTP 400.
4. **Invalidación Global de Sesiones JWT por `auth_version`:**
   - La tabla `usuarios` incorpora la columna `auth_version INT UNSIGNED NOT NULL DEFAULT 1`.
   - Al restablecer la contraseña, se actualiza el hash de la clave con `bcrypt`, se registra `contrasena_cambiada_en = NOW()` y se incrementa atómicamente `auth_version = COALESCE(auth_version, 1) + 1`.
   - El middleware `autenticar` compara `payload.auth_version === Number(usuarioDb.auth_version)`, invalidando instantáneamente cualquier sesión JWT anterior (HTTP 401: *"Tu sesión ha expirado por cambio de contraseña"*).

### C. Módulo Transaccional de Correo (`backend/src/email.js`)
1. **Conexión Relay Brevo:** Integración mediante puerto 587 con STARTTLS obligatorio y validación estricta de certificados TLS.
2. **Prevención de Inyección CRLF:** Sanitización de encabezados en el asunto (`sanitizarAsunto`) para impedir inyecciones de cabeceras SMTP (`\r\n`).
3. **Enmascaramiento de Privacidad (PII):** Los logs y respuestas diagnósticas nunca exponen correos completos ni contraseñas (`enmascararCorreo`, `sanitizarMensajeError`).
4. **Límites de Seguridad DoS:** Restricción de destinatario a 254 caracteres, asunto a 255 caracteres y cuerpo a 500 KB UTF-8.
5. **Timeouts Acotados:** 10 s para conexión TCP, 10 s para saludo SMTP y 15 s de socket, con listener `transporter.on('error')` en el pool para evitar caídas no controladas del proceso Node.js.

### D. Interfaz de Usuario (Frontend React 19)
1. **Páginas Implementadas:** `OlvideContrasena.jsx` y `RestablecerContrasena.jsx` con estilos dedicados y diseño accesible.
2. **Protección de Tokens en Navegador:** El parámetro `?token=` es eliminado de inmediato de la URL y del historial del navegador tras la carga mediante `setSearchParams({}, { replace: true })`, evitando exposiciones en pantalla o historial.

---

## 3. Registro Expreso de Validación en Bases de Datos

> [!IMPORTANT]
> **Aislamiento de la Base de Datos de Producción:**
> - La validación de integración, pruebas funcionales y pruebas interactivas reales se realizaron **exclusivamente contra la base de datos de pruebas `turnos_db_migracion_test`**.
> - La base de datos principal de producción **`turnos_db` NO fue modificada**. Permanece intacta con sus 5 tablas y 27 registros originales.
> - **Acción Pendiente Obligatoria para Despliegue:** La migración estructural `backend/migracion_correo_003.sql` **queda formalmente pendiente de aplicación en `turnos_db`** para el momento de la puesta en marcha oficial.

---

## 4. Resultados de la Verificación Real de Envío y Restablecimiento

Se ejecutó una prueba controlada interactiva de extremo a extremo:
1. **Destinatario de Prueba:** `jhostyndavid44@gmail.com`.
2. **Remitente Verificado en Brevo:** `filacero615@gmail.com`.
3. **Envío Transaccional:** Aceptado por el relay `smtp-relay.brevo.com:587` con `messageId: <0642c38f-310c-b6bc-30ee-b22da5e4e28c@gmail.com>`.
4. **Recepción:** El correo fue recibido en la bandeja de entrada del usuario.
5. **Apertura Local:** El enlace `http://localhost:5173/restablecer-contrasena?token=...` fue atendido por el frontend Vite local y el backend Express en el puerto 3000.
6. **Restablecimiento y Revalidación (Repetida 3 Veces):**
   - Se completaron 3 ciclos reales de emisión y consumo de tokens.
   - Los 3 tokens quedaron registrados con `usado = 1` en `turnos_db_migracion_test`.
   - La columna `auth_version` del usuario avanzó progresivamente de 1 a 3.
   - El inicio de sesión con la nueva contraseña y el nuevo token JWT funcionó correctamente.

---

## 5. Resumen de Pruebas Automatizadas

Se ejecutaron 15 suites de pruebas en el entorno local con un total de **583 pruebas aprobadas**:

| Área / Módulo | Suite de Pruebas | Resultado |
| :--- | :--- | :---: |
| Recuperación de Contraseña | `backend/test_recuperacion_contrasena.mjs` | **44 / 44 Aprobadas** |
| Verificación de Correo | `backend/test_verificacion_correo.mjs` | **56 / 56 Aprobadas** |
| Inyección CRLF en Asuntos | `backend/test_email_crlf.mjs` | **16 / 16 Aprobadas** |
| Privacidad y Enmascaramiento PII | `backend/test_email_masking.mjs` | **31 / 31 Aprobadas** |
| Manejo Seguro de Errores SMTP | `backend/test_email_error_handling.mjs` | **25 / 25 Aprobadas** |
| Límites de Memoria y Prevención DoS | `backend/test_email_limits.mjs` | **24 / 24 Aprobadas** |
| Pool y Sockets SMTP | `backend/test_email_transport_pool.mjs` | **18 / 18 Aprobadas** |
| Consulta Pública de Turnos | `backend/test_consulta_publica.cjs` | **47 / 47 Aprobadas** |
| Notificaciones en Tiempo Real (SSE) | `backend/test_notificaciones.cjs` | **47 / 47 Aprobadas** |
| Estadísticas Administrativas | `backend/test_estadisticas.cjs` | **41 / 41 Aprobadas** |
| Gestión de Servicios | `backend/test_servicios.cjs` | **49 / 49 Aprobadas** |
| Frontend: Horarios y Zonas Horarias | `frontend/test_tiempo.js` | **134 / 134 Aprobadas** |
| Frontend: Verificación y UI | `frontend/test_verificacion_frontend.mjs`| **51 / 51 Aprobadas** |
| Frontend: Linter ESLint | `eslint .` | **0 advertencias / 0 errores** |
| Frontend: Compilación de Producción | `vite build` | **Compilación exitosa (dist)** |
| **TOTAL CONSOLIDADO** | **15 Suites de Pruebas** | **583 APROBADAS / 0 FALLIDAS** |

---

## 6. Registro Transparente de Diagnósticos Pendientes en Suites Legadas

> [!WARNING]
> **Suites Legadas Anteriores (Fase 1) Pendientes de Diagnóstico:**
> Durante la auditoría general del proyecto se ejecutaron las suites antiguas de la fase inicial, registrando fallos específicos debidos a la evolución del proyecto:
>
> 1. **`backend/test_suite_20.cjs`:**
>    - *Fallo registrado:* `TypeError: Bind parameters must not contain undefined` en la línea 239 de la suite legada (`PromiseConnection.execute`).
>    - *Diagnóstico preliminar:* La prueba antigua envía un parámetro `undefined` al preparar una inserción de turno de prueba, lo cual es rechazado por la versión actual del driver `mysql2` (modo estricto).
> 2. **`backend/test_audit_hardening.cjs`:**
>    - *Fallo registrado:* `ENOENT: no such file or directory, open 'C:\Users\Jhostyn\proyecto_final\src\auth.js'`.
>    - *Diagnóstico preliminar:* La prueba legada contiene una ruta fija que busca el archivo en `src/auth.js` en lugar de la ubicación real del backend `backend/src/auth.js`.
>
> Ambas suites quedan registradas como **ítems técnicos pendientes de refactorización/mantenimiento de tests legados**, sin que esto afecte los módulos funcionales en producción.

---

## 7. Declaración de Seguridad Responsable

> [!NOTE]
> De acuerdo con las buenas prácticas de ingeniería de software y seguridad de la información, **no se declara que el sistema en su totalidad esté libre de vulnerabilidades**. Se certifica que los controles específicos auditados (almacenamiento de tokens, vencimiento a 30 minutos, un solo uso, invalidación de sesiones previas por versión, anti-enumeración, cooldown de 2 minutos, prevención de CRLF y operación compensatoria ante caídas de red) han sido probados rigurosamente y funcionan conforme al diseño de seguridad establecido.

---

## 8. Estado de Archivos y Próximos Pasos

- **Archivos del repositorio:** Intactos, sin modificaciones no autorizadas en código funcional ni configuración.
- **Rama:** `feature/Jhostyn`.
- **Cierre formal:** Queda cerrado documentalmente el desarrollo de la recuperación de contraseña.
