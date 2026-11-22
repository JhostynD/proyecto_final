-- ================================================================
-- FILA CERO — Esquema inicial completo de base de datos
-- Motor: MariaDB 10.4+ / MySQL 8.0+ (InnoDB, utf8mb4)
-- Incluye todas las columnas y tablas necesarias para una
-- instalación nueva, equivalente a aplicar las migraciones
-- 001, 002 y 003 sobre el esquema base.
--
-- INSTALACIÓN NUEVA: ejecutar SOLO este archivo.
-- ACTUALIZACIÓN DE INSTALACIÓN EXISTENTE: aplicar en orden
--   migracion_seguridad_001.sql
--   migracion_notificaciones_002.sql
--   migracion_correo_003.sql
-- ================================================================

CREATE DATABASE IF NOT EXISTS turnos_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE turnos_db;

-- ----------------------------------------------------------------
-- TABLA: usuarios
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id                      INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  nombre                  VARCHAR(100)  NOT NULL,
  correo                  VARCHAR(150)  NOT NULL UNIQUE,
  contraseña              VARCHAR(255)  NOT NULL,
  rol                     ENUM('usuario', 'admin') NOT NULL DEFAULT 'usuario',
  activo                  BOOLEAN       NOT NULL DEFAULT TRUE
                          COMMENT 'FALSE deshabilita la cuenta sin eliminarla',
  correo_verificado       TINYINT(1)    NOT NULL DEFAULT 0
                          COMMENT '0 = pendiente de verificación, 1 = verificado',
  verificacion_enviada_en DATETIME      NULL
                          COMMENT 'Controla el intervalo anti-reenvío de correo de verificación',
  contrasena_cambiada_en  DATETIME      NULL
                          COMMENT 'Fecha del último cambio de contraseña; usado para invalidar JWTs anteriores',
  auth_version            INT UNSIGNED  NOT NULL DEFAULT 1
                          COMMENT 'Versión de autenticación; se incrementa al restablecer contraseña',
  creado_en               TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- TABLA: servicios
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS servicios (
  id                    INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  nombre                VARCHAR(100)  NOT NULL UNIQUE,
  codigo_prefijo        VARCHAR(5)    NULL,
  modalidad             ENUM('turno', 'cita', 'turno_y_cita') NOT NULL DEFAULT 'cita',
  duracion_estimada_min INT UNSIGNED  NOT NULL DEFAULT 30,
  requiere_tema         BOOLEAN       NOT NULL DEFAULT FALSE,
  descripcion           VARCHAR(255)  NULL,
  activo                BOOLEAN       NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- TABLA: turnos
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS turnos (
  id                  INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  usuario_id          INT UNSIGNED  NOT NULL,
  servicio_id         INT UNSIGNED  NOT NULL,
  modalidad           ENUM('turno', 'cita') NOT NULL DEFAULT 'cita',
  fecha               DATE          NOT NULL,
  hora                TIME          NOT NULL,
  estado              ENUM('pendiente', 'confirmado', 'en_espera', 'llamando',
                           'en_atencion', 'completado', 'cancelado', 'no_presentado')
                      NOT NULL DEFAULT 'pendiente',
  codigo_turno        VARCHAR(10)   NULL,
  motivo              VARCHAR(255)  NULL,
  modulo              VARCHAR(20)   NULL,
  checkin_en          DATETIME      NULL,
  llamado_en          DATETIME      NULL,
  atencion_inicio_en  DATETIME      NULL,
  atencion_fin_en     DATETIME      NULL,
  creado_en           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_turnos_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios(id)  ON DELETE CASCADE,
  CONSTRAINT fk_turnos_servicio FOREIGN KEY (servicio_id) REFERENCES servicios(id),
  INDEX idx_turnos_fecha_estado  (fecha, estado, servicio_id),
  UNIQUE INDEX idx_turnos_codigo_unico (codigo_turno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- TABLA: sesiones_revocadas
-- Para invalidación explícita de JWT individuales (logout, cambio de rol)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sesiones_revocadas (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  jti         VARCHAR(64)   NOT NULL UNIQUE
              COMMENT 'JWT ID único del token revocado',
  usuario_id  INT UNSIGNED  NOT NULL
              COMMENT 'Referencia al usuario dueño del token',
  revocado_en DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en   DATETIME      NOT NULL
              COMMENT 'Momento en que el token original hubiera expirado (para limpieza)',

  INDEX idx_jti    (jti),
  INDEX idx_expira (expira_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tokens JWT revocados explícitamente antes de su expiración natural';

-- ----------------------------------------------------------------
-- TABLA: notificaciones
-- Notificaciones internas sobre cambios de estado de turnos
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notificaciones (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED  NOT NULL
              COMMENT 'ID del usuario destinatario',
  turno_id    INT UNSIGNED  NULL
              COMMENT 'ID del turno relacionado (SET NULL si el turno se elimina)',
  tipo_evento VARCHAR(50)   NOT NULL
              COMMENT 'Tipo semántico: turno_confirmado, turno_cancelado, turno_completado',
  titulo      VARCHAR(150)  NOT NULL
              COMMENT 'Título breve de la notificación',
  mensaje     TEXT          NOT NULL
              COMMENT 'Detalle del evento para el usuario',
  leido       BOOLEAN       NOT NULL DEFAULT FALSE,
  leido_en    DATETIME      NULL
              COMMENT 'Momento en que el usuario marcó la notificación como leída',
  creado_en   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_notificaciones_usuario_leido (usuario_id, leido, creado_en),
  INDEX idx_notificaciones_turno         (turno_id),
  CONSTRAINT fk_notificaciones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_notificaciones_turno   FOREIGN KEY (turno_id)   REFERENCES turnos(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Notificaciones internas de usuario sobre eventos de turnos';

-- ----------------------------------------------------------------
-- TABLA: tokens_verificacion
-- Tokens de un solo uso para verificación de correo electrónico
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tokens_verificacion (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED  NOT NULL
              COMMENT 'Usuario dueño del token; CASCADE elimina tokens si se elimina la cuenta',
  token_hash  VARCHAR(64)   NOT NULL UNIQUE
              COMMENT 'SHA-256 hex del token original; nunca el token en claro',
  expira_en   DATETIME      NOT NULL
              COMMENT 'Momento a partir del cual el token deja de ser válido (TTL: 24 h)',
  usado       TINYINT(1)    NOT NULL DEFAULT 0
              COMMENT '1 cuando el token ya fue consumido; impide reutilización',
  creado_en   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_tv_hash_activo    (token_hash, usado, expira_en),
  INDEX idx_tv_usuario_activo (usuario_id, usado),
  INDEX idx_tv_expira         (expira_en),

  CONSTRAINT fk_tv_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Hashes de tokens de un solo uso para verificación de correo';

-- ----------------------------------------------------------------
-- TABLA: tokens_recuperacion
-- Tokens de un solo uso para recuperación de contraseña
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tokens_recuperacion (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED  NOT NULL
              COMMENT 'Usuario dueño del token; CASCADE elimina tokens si se elimina la cuenta',
  token_hash  VARCHAR(64)   NOT NULL UNIQUE
              COMMENT 'SHA-256 hex del token original; nunca el token en claro',
  expira_en   DATETIME      NOT NULL
              COMMENT 'Momento a partir del cual el token deja de ser válido (TTL: 1 h)',
  usado       TINYINT(1)    NOT NULL DEFAULT 0
              COMMENT '1 cuando el token ya fue consumido; impide reutilización',
  creado_en   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_tr_hash_activo    (token_hash, usado, expira_en),
  INDEX idx_tr_usuario_activo (usuario_id, usado),
  INDEX idx_tr_expira         (expira_en),

  CONSTRAINT fk_tr_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Hashes de tokens de un solo uso para recuperación de contraseña';

-- ----------------------------------------------------------------
-- DATOS INICIALES: servicios de ejemplo
-- ----------------------------------------------------------------
INSERT INTO servicios (id, nombre, codigo_prefijo, modalidad, duracion_estimada_min, requiere_tema, descripcion, activo) VALUES
  (1, 'Asesoría de Crédito',    'CR', 'cita',        30, TRUE,  'Asesoría personalizada para productos de crédito, libranzas y préstamos.',   TRUE),
  (2, 'Soporte Técnico',        'ST', 'turno',        15, FALSE, 'Turno virtual inmediato para consultas técnicas y banca móvil.',             TRUE),
  (3, 'Atención General',       'AG', 'turno_y_cita', 20, FALSE, 'Atención presencial en ventanilla o agendamiento con cita previa.',          TRUE),
  (4, 'Asesoría Financiera',    'AF', 'cita',         30, TRUE,  'Planificación de inversiones, CDT y gestión de patrimonios.',               TRUE),
  (5, 'Atención Especializada', 'AE', 'cita',         60, TRUE,  'Consultoría empresarial, comercio exterior y trámites avanzados.',           TRUE)
ON DUPLICATE KEY UPDATE
  codigo_prefijo        = VALUES(codigo_prefijo),
  modalidad             = VALUES(modalidad),
  duracion_estimada_min = VALUES(duracion_estimada_min),
  requiere_tema         = VALUES(requiere_tema),
  descripcion           = VALUES(descripcion);
