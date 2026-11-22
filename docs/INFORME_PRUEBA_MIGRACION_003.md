# INFORME DE PRUEBA DE MIGRACIÓN 003 — FILA CERO

**Fecha de ejecución:** 17 de noviembre de 2026
**Rama:** `feature/Jhostyn`
**Base de datos de prueba:** `turnos_db_restore_test` (réplica restaurada y validada de `turnos_db`)
**Script ejecutado:** `backend/migracion_correo_003.sql`
**Estado:** **APROBADA** para consideración de migración a la base principal.

---

## 1. Verificaciones Previas a la Ejecución

Antes de ejecutar cualquier instrucción SQL, se constató el cumplimiento estricto de las condiciones de seguridad:
* **Rama Git:** `feature/Jhostyn` confirmada y activa.
* **Existencia del respaldo:** `docs/backup_turnos_db_pre_003.sql` (20,140 bytes, verificado íntegro).
* **Integridad de la base original:** `turnos_db` mantiene sus 5 tablas originales (`notificaciones`, `servicios`, `sesiones_revocadas`, `turnos`, `usuarios`) sin ninguna modificación.
* **Base aislada de prueba:** `turnos_db_restore_test` existía y contenía exactamente la restauración fiel 1:1 de `turnos_db`.
* **Destino de la conexión:** El comando de aplicación fue dirigido explícita y unívocamente a `turnos_db_restore_test`.

---

## 2. Resultado de la Ejecución

* **Comando ejecutado:**
  ```powershell
  & "C:\xampp\mysql\bin\mysql.exe" --host=localhost --port=3306 --user=root turnos_db_restore_test -e "source c:/Users/Jhostyn/proyecto_final/backend/migracion_correo_003.sql"
  ```
* **Código de salida:** `0` (Exitoso sin advertencias ni interrupciones).
* **Salida de las consultas de verificación embebidas (Sección 4 del script SQL):**
  * Todas las columnas nuevas fueron detectadas en `usuarios`.
  * Las tablas `tokens_verificacion` y `tokens_recuperacion` fueron creadas exitosamente.
  * La consulta de distribución arrojó: `correo_verificado = 1`, `activo = 1`, `total = 27`.

---

## 3. Validación Estructural

### 3.1 Inventario de Tablas
La base de datos cuenta ahora con las **7 tablas requeridas**:
1. `notificaciones`
2. `servicios`
3. `sesiones_revocadas`
4. `tokens_recuperacion` *(nueva)*
5. `tokens_verificacion` *(nueva)*
6. `turnos`
7. `usuarios`

### 3.2 Columnas Nuevas en `usuarios`
Se verificó la adición de las 4 columnas con sus especificaciones exactas:

| Columna | Tipo de Dato | Nulo | Valor Predeterminado | Propósito |
| :--- | :---: | :---: | :---: | :--- |
| `correo_verificado` | `tinyint(1)` | NO | `0` | Indicador booleano de verificación de correo. |
| `verificacion_enviada_en` | `datetime` | YES | `NULL` | Marca temporal para control de tasa y cooldown de reenvío. |
| `contrasena_cambiada_en` | `datetime` | YES | `NULL` | Marca temporal de cambio de clave para invalidar JWTs emitidos previamente. |
| `auth_version` | `int(10) unsigned` | NO | `1` | Versión incremental de autenticación de la cuenta. |

### 3.3 Estructura de `tokens_verificacion`
* **Campos:**
  * `id`: `int(10) unsigned` NOT NULL AUTO_INCREMENT (PRIMARY KEY).
  * `usuario_id`: `int(10) unsigned` NOT NULL.
  * `token_hash`: `varchar(64)` NOT NULL UNIQUE.
  * `expira_en`: `datetime` NOT NULL.
  * `usado`: `tinyint(1)` NOT NULL DEFAULT 0.
  * `creado_en`: `timestamp` NOT NULL DEFAULT current_timestamp().
* **Índices de optimización:**
  * `token_hash` (UNIQUE)
  * `idx_tv_hash_activo` (`token_hash`, `usado`, `expira_en`)
  * `idx_tv_usuario_activo` (`usuario_id`, `usado`)
  * `idx_tv_expira` (`expira_en`)
* **Integridad referencial:**
  * `CONSTRAINT fk_tv_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE`.

### 3.4 Estructura de `tokens_recuperacion`
* **Campos:**
  * `id`: `int(10) unsigned` NOT NULL AUTO_INCREMENT (PRIMARY KEY).
  * `usuario_id`: `int(10) unsigned` NOT NULL.
  * `token_hash`: `varchar(64)` NOT NULL UNIQUE.
  * `expira_en`: `datetime` NOT NULL.
  * `usado`: `tinyint(1)` NOT NULL DEFAULT 0.
  * `creado_en`: `timestamp` NOT NULL DEFAULT current_timestamp().
* **Índices de optimización:**
  * `token_hash` (UNIQUE)
  * `idx_tr_hash_activo` (`token_hash`, `usado`, `expira_en`)
  * `idx_tr_usuario_activo` (`usuario_id`, `usado`)
  * `idx_tr_expira` (`expira_en`)
* **Integridad referencial:**
  * `CONSTRAINT fk_tr_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE`.

---

## 4. Validación de Datos e Integridad

### 4.1 Comparativa de Conteos de Registros

| Tabla | Base Original (`turnos_db`) | Post-Migración (`turnos_db_restore_test`) | Estado |
| :--- | :---: | :---: | :---: |
| `notificaciones` | 1 | 1 | Coincidencia 100% |
| `servicios` | 5 | 5 | Coincidencia 100% |
| `sesiones_revocadas` | 0 | 0 | Coincidencia 100% |
| `turnos` | 54 | 54 | Coincidencia 100% |
| `usuarios` | 27 | 27 | Coincidencia 100% |

### 4.2 Preservación de Datos Preexistentes de Usuarios
Se verificó registro a registro (`id`, `rol`, `activo`, `creado_en`, contraseñas y correos) entre la versión previa y la post-migración:
* **Resultado:** 100% de coincidencia exacta. No hubo pérdidas, truncamiento ni alteraciones de contraseñas ni datos originales.

### 4.3 Estado de las Columnas Nuevas para los 27 Usuarios
* `correo_verificado`: **1** en los 27 usuarios (100% preservan acceso sin bloqueo por falta de verificación).
* `auth_version`: **1** en los 27 usuarios (100% compatibles con la emisión de tokens JWT).
* `verificacion_enviada_en`: **NULL** en los 27 usuarios.
* `contrasena_cambiada_en`: **NULL** en los 27 usuarios.

---

## 5. Pruebas de Comportamiento e Integridad Referencial

Se ejecutó una prueba transaccional aislada (con `ROLLBACK` final obligatorio para no alterar la base):
1. **Inserción de tokens de prueba:**
   * Se insertó un hash SHA-256 válido de 64 caracteres vinculado al usuario 1. Inserción exitosa.
2. **Restricción de unicidad (`UNIQUE` en `token_hash`):**
   * Al intentar insertar un segundo token con el mismo hash, el motor bloqueó la inserción y arrojó `ER_DUP_ENTRY`.
3. **Clave foránea e integridad referencial (`ON DELETE CASCADE`):**
   * Al intentar asociar un token a un `usuario_id` inexistente (`9999999`), el motor rechazó la inserción con `ER_NO_REFERENCED_ROW_2`.
4. **Comportamiento de nuevos registros futuros:**
   * Al simular la inserción de un usuario nuevo omitiendo las columnas nuevas, se asignaron los valores por defecto:
     * `correo_verificado = 0` (exigirá confirmación por correo según diseño).
     * `auth_version = 1`.
     * `verificacion_enviada_en = NULL`.
     * `contrasena_cambiada_en = NULL`.
5. **Compatibilidad con el middleware de autenticación:**
   * Los 27 usuarios cumplen a cabalidad las reglas de validación en `backend/src/auth.js` (`activo === 1`, `correo_verificado === 1`, `auth_version === 1`), garantizando que ninguno experimentará interrupción de servicio.

---

## 6. Comparación con `turnos_db_migracion_test`

Se contrastaron las definiciones DDL generadas en `turnos_db_restore_test` frente a `turnos_db_migracion_test`:
* **Resultado:** El esquema relacional, claves primarias, claves foráneas, columnas, tipos de datos, índices y valores por defecto son **idénticos**.
* **Nota sobre cotejamiento en comentarios:** La única diferencia observada a nivel de texto en `SHOW CREATE TABLE` se debió a la codificación de caracteres en los comentarios de las columnas durante la sesión interactiva de la terminal de Windows (acentos UTF-8 vs caracteres extendidos), lo cual no tiene impacto alguno en la semántica ni en el funcionamiento del motor de base de datos.

---

## 7. Análisis de Riesgos Pendientes

1. **Ventana de bloqueo durante la aplicación:**
   * Dado que `turnos_db` cuenta con 27 usuarios, la ejecución de las sentencias `ALTER TABLE` y `CREATE TABLE` toma menos de 100 milisegundos. El tiempo de indisponibilidad es prácticamente nulo.
2. **Compatibilidad con sesiones existentes:**
   * Como los usuarios existentes inician con `auth_version = 1` y `contrasena_cambiada_en = NULL`, cualquier token JWT emitido anteriormente que sea validado seguirá funcionando si no ha expirado, o requerirá inicio de sesión estándar.
3. **Reversibilidad comprobada:**
   * Se cuenta con el respaldo validado `docs/backup_turnos_db_pre_003.sql` y el procedimiento de reversión documentado y probado.

---

## 8. Conclusión

**ESTADO: APROBADA**

La migración `backend/migracion_correo_003.sql`:
1. Es completamente segura, no destructiva e idempotente.
2. Mantiene íntegros todos los datos existentes (27 usuarios, 5 servicios, 54 turnos, 1 notificación).
3. Habilita con total normalidad las funcionalidades de verificación de correo y recuperación de contraseña.
4. Establece correctamente las protecciones para usuarios nuevos (`correo_verificado = 0`).

Se considera apta para ser programada y ejecutada sobre la base de datos principal `turnos_db` cuando el usuario lo disponga.
