-- ================================================================
-- MIGRACIÓN DE NOTIFICACIONES 002 — FILA CERO
-- Fecha: 2026-10-22
-- Rama: feature/Jhostyn
-- Descripción:
--   1. Crea la tabla 'notificaciones' para persistir notificaciones
--      internas del sistema dirigidas a usuarios (cambios de estado de turnos).
--   2. Define índices compuestos para optimizar conteo de no leídas
--      y listado paginado por usuario y fecha.
--   3. Configura claves foráneas seguras con borrado en cascada para
--      usuarios y SET NULL para turnos.
--
-- REVERSIÓN (Rollback seguro):
--   DROP TABLE IF EXISTS notificaciones;
--
-- ESTRATEGIA DE DESPLIEGUE SEGURA:
--   a. Aplicar primero en entorno de pruebas y validar con test_notificaciones.cjs.
--   b. Realizar backup de base de datos antes de aplicar en producción.
--   c. Aplicar con comando: mysql -u <user> -p <db_name> < migracion_notificaciones_002.sql
--   d. No altera ni elimina datos existentes en otras tablas.
-- ================================================================

CREATE TABLE IF NOT EXISTS notificaciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL COMMENT 'ID del usuario destinatario (obtenido del turno en BD)',
  turno_id INT UNSIGNED NULL COMMENT 'ID del turno relacionado (SET NULL si el turno se elimina)',
  tipo_evento VARCHAR(50) NOT NULL COMMENT 'Tipo semántico: turno_confirmado, turno_cancelado, turno_completado',
  titulo VARCHAR(150) NOT NULL COMMENT 'Título breve de la notificación',
  mensaje TEXT NOT NULL COMMENT 'Detalle del evento para el usuario',
  leido BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'FALSE = no leída, TRUE = leída',
  leido_en DATETIME NULL COMMENT 'Momento en que el usuario marcó la notificación como leída',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de generación del evento',

  INDEX idx_notificaciones_usuario_leido (usuario_id, leido, creado_en),
  INDEX idx_notificaciones_turno (turno_id),
  CONSTRAINT fk_notificaciones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_notificaciones_turno FOREIGN KEY (turno_id) REFERENCES turnos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Notificaciones internas de usuario sobre eventos de turnos';

-- Verificación no destructiva de la tabla recién creada
SELECT
  TABLE_NAME,
  ENGINE,
  TABLE_ROWS,
  CREATE_TIME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'notificaciones';
