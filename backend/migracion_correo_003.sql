-- ================================================================
-- MIGRACIÓN DE CORREO 003 — FILA CERO
-- Fecha: 2026-11-13
-- Rama: feature/Jhostyn
-- Motor verificado: MariaDB 10.4.32 (InnoDB)
--
-- Descripción:
--   1. Añade tres columnas a 'usuarios':
--        · correo_verificado       — indica si el correo fue confirmado
--        · verificacion_enviada_en — controla el intervalo anti-reenvío
--        · contrasena_cambiada_en  — invalida tokens JWT emitidos antes
--                                    del cambio de contraseña
--   2. Aplica la OPCIÓN A (decisión de continuidad) de forma segura
--      e idempotente, sin UPDATE global:
--        · correo_verificado se añade con DEFAULT 1 → todos los registros
--          existentes reciben el valor 1 automáticamente en el ADD COLUMN.
--        · A continuación se cambia el DEFAULT a 0 (solo afecta a inserts
--          futuros; no modifica ninguna fila ya existente).
--        · Una segunda ejecución es completamente segura: ADD COLUMN
--          IF NOT EXISTS no hace nada si la columna ya existe, y
--          ALTER COLUMN SET DEFAULT 0 es idempotente.
--   3. Crea la tabla 'tokens_verificacion'.
--   4. Crea la tabla 'tokens_recuperacion'.
--
-- GARANTÍAS DE IDEMPOTENCIA (verificadas en MariaDB 10.4.32):
--   · ADD COLUMN IF NOT EXISTS: si la columna ya existe, la instrucción
--     se omite completamente — no modifica ninguna fila existente.
--   · ALTER COLUMN SET DEFAULT: solo cambia el valor predeterminado
--     para inserts futuros; nunca toca filas ya almacenadas.
--   · CREATE TABLE IF NOT EXISTS: si la tabla ya existe, se omite.
--   · Sin UPDATE global: ninguna segunda ejecución puede marcar como
--     verificados a usuarios nuevos que aún no confirmaron su correo.
--
-- CONVENCIÓN DE ALMACENAMIENTO DE TOKENS:
--   Nunca se almacena el token original en la base de datos.
--   Solo se guarda su hash SHA-256 (64 caracteres hexadecimales).
--   El token original se transmite únicamente en el enlace de correo.
--
-- REVERSIÓN (en orden inverso):
--   DROP TABLE IF EXISTS tokens_recuperacion;
--   DROP TABLE IF EXISTS tokens_verificacion;
--   ALTER TABLE usuarios DROP COLUMN IF EXISTS contrasena_cambiada_en;
--   ALTER TABLE usuarios DROP COLUMN IF EXISTS verificacion_enviada_en;
--   ALTER TABLE usuarios DROP COLUMN IF EXISTS correo_verificado;
--
-- ESTRATEGIA DE DESPLIEGUE SEGURA:
--   a. Aplicar primero en entorno de prueba y verificar con SELECT final.
--   b. Realizar backup completo de la BD de producción antes de aplicar.
--   c. Los usuarios existentes quedan con correo_verificado = 1
--      automáticamente (sin UPDATE; el ADD COLUMN lo hace por DEFAULT).
--   d. Los nuevos registros posteriores empiezan con correo_verificado = 0.
--   e. Aplicar durante una ventana de mantenimiento o con tráfico bajo.
--   f. Verificar que el servidor Node arranca correctamente.
--
-- COMANDO DE APLICACIÓN:
--   mysql -u <user> -p <db_name> < migracion_correo_003.sql
-- ================================================================

-- ----------------------------------------------------------------
-- 1. COLUMNAS NUEVAS EN USUARIOS
-- ----------------------------------------------------------------

-- 1.1 Indicador de verificación de correo electrónico.
--
--     ESTRATEGIA DE DOS PASOS (idempotente, sin UPDATE global):
--
--     PASO A — ADD COLUMN con DEFAULT 1:
--       En MariaDB, cuando se añade una columna a una tabla con filas
--       existentes, todas esas filas reciben el valor DEFAULT de forma
--       inmediata. Al usar DEFAULT 1, todos los usuarios ya registrados
--       quedan marcados como verificados automáticamente (Opción A).
--       Si la columna ya existe (segunda ejecución), IF NOT EXISTS omite
--       la instrucción por completo sin modificar ninguna fila.
--
--     PASO B — ALTER COLUMN SET DEFAULT 0:
--       Cambia únicamente el valor predeterminado para inserts futuros.
--       No modifica ninguna fila ya almacenada en la tabla.
--       Es idempotente: ejecutarlo múltiples veces produce el mismo resultado.
--
--     Resultado garantizado:
--       · Usuarios preexistentes       → correo_verificado = 1
--       · Usuarios creados post-migración → correo_verificado = 0
--       · Segunda ejecución             → ningún cambio en filas existentes
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS correo_verificado TINYINT(1) NOT NULL DEFAULT 1
  COMMENT 'TRUE(1) si el usuario confirmó su correo; FALSE(0) si aún no lo ha verificado. Los usuarios preexistentes se crean en 1 por diseño de migración.';

-- Paso B: cambiar el DEFAULT a 0 para todos los inserts futuros.
-- Esta instrucción NO modifica ninguna fila existente.
-- Es idempotente: si ya era 0, el resultado es idéntico.
ALTER TABLE usuarios
  ALTER COLUMN correo_verificado SET DEFAULT 0;

-- 1.2 Marca temporal del último envío de correo de verificación.
--     Permite aplicar un intervalo mínimo entre reenvíos para prevenir abuso.
--     NULL: nunca se envió un correo de verificación para este usuario.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS verificacion_enviada_en DATETIME NULL
  COMMENT 'Última vez que se envió el correo de verificación; usado para control de intervalo anti-reenvío';

-- 1.3 Marca temporal del último cambio de contraseña exitoso.
--     El middleware autenticar rechazará tokens JWT cuyo campo iat
--     sea anterior a esta fecha, invalidando automáticamente todas
--     las sesiones abiertas antes del restablecimiento.
--     NULL: contraseña nunca restablecida por este flujo; tokens válidos.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS contrasena_cambiada_en DATETIME NULL
  COMMENT 'Fecha del último restablecimiento de contraseña; tokens JWT emitidos antes de esta fecha quedan invalidados';

-- 1.4 Versión de autenticación del usuario.
--     Cada JWT emitido lleva 'auth_version'. Si el usuario restablece su contraseña,
--     'auth_version' se incrementa en 1 en la base de datos, invalidando inmediatamente
--     todos los JWT emitidos con la versión anterior.
--     DEFAULT 1: los usuarios existentes y nuevos inician en versión 1.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS auth_version INT UNSIGNED NOT NULL DEFAULT 1
  COMMENT 'Versión de autenticación del usuario; se incrementa al cambiar contraseña para invalidar tokens previos';

-- ----------------------------------------------------------------
-- 2. TABLA tokens_verificacion
-- ----------------------------------------------------------------
-- Almacena el hash SHA-256 de los tokens de un solo uso utilizados
-- para confirmar la dirección de correo electrónico de un usuario.
--
-- Ciclo de vida de un token:
--   · Generado en el backend con crypto.randomBytes(32).
--   · Solo el hash SHA-256 (hex, 64 chars) se persiste aquí.
--   · El token original viaja exclusivamente en el enlace de correo.
--   · Un nuevo reenvío invalida los tokens anteriores del mismo usuario:
--       UPDATE tokens_verificacion SET usado = 1
--       WHERE usuario_id = ? AND usado = 0
--     ...antes de insertar el nuevo registro.
--   · Tras validación exitosa: usado = 1; correo_verificado = 1 en usuarios.
--   · Tras expiración sin uso: queda en la tabla hasta limpieza periódica.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tokens_verificacion (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED  NOT NULL
                            COMMENT 'Usuario dueño del token; CASCADE elimina tokens si se elimina la cuenta',
  token_hash  VARCHAR(64)   NOT NULL UNIQUE
                            COMMENT 'SHA-256 hex del token original (64 caracteres); nunca el token en claro',
  expira_en   DATETIME      NOT NULL
                            COMMENT 'Momento a partir del cual el token deja de ser válido (TTL recomendado: 24 h)',
  usado       TINYINT(1)    NOT NULL DEFAULT 0
                            COMMENT '1 cuando el token ya fue consumido; impide reutilización',
  creado_en   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                            COMMENT 'Fecha de generación del token; útil para auditoría y limpieza periódica',

  -- Consulta principal: WHERE token_hash = ? AND usado = 0 AND expira_en > NOW()
  INDEX idx_tv_hash_activo    (token_hash, usado, expira_en),
  -- Invalidación de tokens anteriores: WHERE usuario_id = ? AND usado = 0
  INDEX idx_tv_usuario_activo (usuario_id, usado),
  -- Limpieza periódica: WHERE expira_en < NOW()
  INDEX idx_tv_expira         (expira_en),

  CONSTRAINT fk_tv_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Hashes de tokens de un solo uso para verificación de correo electrónico';

-- ----------------------------------------------------------------
-- 3. TABLA tokens_recuperacion
-- ----------------------------------------------------------------
-- Almacena el hash SHA-256 de los tokens de un solo uso utilizados
-- para el flujo de recuperación (restablecimiento) de contraseña.
--
-- Ciclo de vida de un token:
--   · Generado en el backend con crypto.randomBytes(32).
--   · Solo el hash SHA-256 (hex, 64 chars) se persiste aquí.
--   · El token original viaja exclusivamente en el enlace de correo.
--   · Antes de insertar un nuevo token, los anteriores del mismo usuario
--     se invalidan (UPDATE ... SET usado = 1 WHERE usuario_id = ? AND usado = 0).
--   · Tras validación y cambio de contraseña:
--       usado = 1 en este registro.
--       contrasena_cambiada_en = NOW() en usuarios (invalida JWTs anteriores).
--   · TTL recomendado: 1 hora (más corto que verificación por mayor sensibilidad).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tokens_recuperacion (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED  NOT NULL
                            COMMENT 'Usuario dueño del token; CASCADE elimina tokens si se elimina la cuenta',
  token_hash  VARCHAR(64)   NOT NULL UNIQUE
                            COMMENT 'SHA-256 hex del token original (64 caracteres); nunca el token en claro',
  expira_en   DATETIME      NOT NULL
                            COMMENT 'Momento a partir del cual el token deja de ser válido (TTL recomendado: 1 h)',
  usado       TINYINT(1)    NOT NULL DEFAULT 0
                            COMMENT '1 cuando el token ya fue consumido; impide reutilización',
  creado_en   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                            COMMENT 'Fecha de generación del token; útil para auditoría y limpieza periódica',

  -- Consulta principal: WHERE token_hash = ? AND usado = 0 AND expira_en > NOW()
  INDEX idx_tr_hash_activo    (token_hash, usado, expira_en),
  -- Invalidación de tokens anteriores: WHERE usuario_id = ? AND usado = 0
  INDEX idx_tr_usuario_activo (usuario_id, usado),
  -- Limpieza periódica: WHERE expira_en < NOW()
  INDEX idx_tr_expira         (expira_en),

  CONSTRAINT fk_tr_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Hashes de tokens de un solo uso para recuperación de contraseña';

-- ================================================================
-- 4. VERIFICACIÓN NO DESTRUCTIVA
-- Consulta el estado real de la BD tras aplicar la migración.
-- No modifica ningún dato.
-- ================================================================

-- 4.1 Confirmar existencia y definición de las columnas nuevas
SELECT
  'usuarios.correo_verificado'       AS objeto,
  COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'usuarios'
  AND COLUMN_NAME  = 'correo_verificado'

UNION ALL

SELECT
  'usuarios.verificacion_enviada_en' AS objeto,
  COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'usuarios'
  AND COLUMN_NAME  = 'verificacion_enviada_en'

UNION ALL

SELECT
  'usuarios.contrasena_cambiada_en'  AS objeto,
  COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'usuarios'
  AND COLUMN_NAME  = 'contrasena_cambiada_en'

UNION ALL

SELECT
  'usuarios.auth_version'            AS objeto,
  COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'usuarios'
  AND COLUMN_NAME  = 'auth_version'

UNION ALL

SELECT
  'tokens_verificacion'  AS objeto,
  'tabla'                AS COLUMN_NAME,
  'OK'                   AS DATA_TYPE,
  NULL                   AS COLUMN_DEFAULT,
  'NO'                   AS IS_NULLABLE
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'tokens_verificacion'

UNION ALL

SELECT
  'tokens_recuperacion'  AS objeto,
  'tabla'                AS COLUMN_NAME,
  'OK'                   AS DATA_TYPE,
  NULL                   AS COLUMN_DEFAULT,
  'NO'                   AS IS_NULLABLE
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'tokens_recuperacion';

-- 4.2 Confirmar el DEFAULT actual de correo_verificado
--     Resultado esperado: COLUMN_DEFAULT = '0' (ya ajustado por ALTER COLUMN SET DEFAULT)
SELECT
  COLUMN_NAME,
  COLUMN_DEFAULT,
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'usuarios'
  AND COLUMN_NAME  = 'correo_verificado';

-- 4.3 Confirmar distribución de verificación entre usuarios existentes
--     Tras la primera ejecución: todos deben tener correo_verificado = 1.
--     Tras una segunda ejecución (con usuarios nuevos en 0): los nuevos
--     deben seguir en 0; los preexistentes deben seguir en 1.
SELECT
  correo_verificado,
  activo,
  COUNT(*) AS total
FROM usuarios
GROUP BY correo_verificado, activo
ORDER BY correo_verificado DESC, activo DESC;
