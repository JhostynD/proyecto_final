-- ================================================================
-- MIGRACIÓN DE SEGURIDAD 001 — FILA CERO
-- Fecha: 2026-10-22
-- Rama: feature/Jhostyn
-- Descripción:
--   1. Añade columna 'activo' a la tabla 'usuarios' para permitir
--      deshabilitar cuentas sin eliminarlas (los tokens activos quedan
--      bloqueados en el próximo intento de login).
--   2. Crea la tabla 'sesiones_revocadas' para soportar invalidación
--      explícita de JWT individuales (logout forzado, cambio de rol).
--      Cada token se identifica por su campo 'jti' (JWT ID).
--   3. Añade índice de limpieza por expiración para mantenimiento.
--
-- REVERSIÓN (en orden inverso):
--   DROP TABLE IF EXISTS sesiones_revocadas;
--   ALTER TABLE usuarios DROP COLUMN IF EXISTS activo;
--
-- ESTRATEGIA DE DESPLIEGUE SEGURA:
--   a. Aplicar primero en entorno de prueba y verificar con el test suite.
--   b. Realizar backup completo de la BD de producción antes de aplicar.
--   c. Aplicar durante una ventana de mantenimiento o con tráfico bajo.
--   d. Verificar que el servidor Node arranca correctamente tras la migración.
-- ================================================================

-- 1. Añadir columna 'activo' a usuarios (valor por defecto TRUE para no romper registros existentes)
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE
  COMMENT 'FALSE deshabilita la cuenta; el usuario no puede iniciar sesión';

-- 2. Crear tabla de sesiones revocadas para invalidación explícita de JWT
CREATE TABLE IF NOT EXISTS sesiones_revocadas (
  id         INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
  jti        VARCHAR(64)    NOT NULL UNIQUE  COMMENT 'JWT ID único del token revocado',
  usuario_id INT UNSIGNED   NOT NULL         COMMENT 'Referencia al usuario dueño del token',
  revocado_en DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en   DATETIME      NOT NULL         COMMENT 'Momento en que el token original hubiera expirado (para limpieza)',

  INDEX idx_jti (jti),
  INDEX idx_expira (expira_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tokens JWT revocados explícitamente antes de su expiración natural';

-- 3. Verificación rápida (no destructiva)
SELECT
  'usuarios.activo' AS objeto,
  COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'usuarios'
  AND COLUMN_NAME = 'activo'
UNION ALL
SELECT
  'sesiones_revocadas' AS objeto,
  'tabla' AS COLUMN_NAME,
  'OK' AS DATA_TYPE,
  NULL AS COLUMN_DEFAULT,
  'NO' AS IS_NULLABLE
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'sesiones_revocadas';
