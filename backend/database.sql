CREATE DATABASE IF NOT EXISTS turnos_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE turnos_db;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  correo VARCHAR(150) NOT NULL UNIQUE,
  contraseña VARCHAR(255) NOT NULL,
  rol ENUM('usuario', 'admin') NOT NULL DEFAULT 'usuario',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS servicios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  modalidad ENUM('turno', 'cita', 'turno_y_cita') NOT NULL DEFAULT 'cita',
  duracion_estimada_min INT UNSIGNED NOT NULL DEFAULT 30,
  requiere_tema BOOLEAN NOT NULL DEFAULT FALSE,
  descripcion VARCHAR(255) NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS turnos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  servicio_id INT UNSIGNED NOT NULL,
  modalidad ENUM('turno', 'cita') NOT NULL DEFAULT 'cita',
  fecha DATE NOT NULL,
  hora TIME NOT NULL,
  estado ENUM('pendiente', 'confirmado', 'en_espera', 'llamando', 'en_atencion', 'completado', 'cancelado', 'no_presentado') NOT NULL DEFAULT 'pendiente',
  codigo_turno VARCHAR(10) NULL,
  motivo VARCHAR(255) NULL,
  modulo VARCHAR(20) NULL,
  checkin_en DATETIME NULL,
  llamado_en DATETIME NULL,
  atencion_inicio_en DATETIME NULL,
  atencion_fin_en DATETIME NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_turnos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_turnos_servicio FOREIGN KEY (servicio_id) REFERENCES servicios(id),
  INDEX idx_turnos_fecha_estado (fecha, estado, servicio_id)
);

INSERT INTO servicios (id, nombre, modalidad, duracion_estimada_min, requiere_tema, descripcion, activo) VALUES
  (1, 'Asesoría de Crédito', 'cita', 30, TRUE, 'Asesoría personalizada para productos de crédito, libranzas y préstamos.', TRUE),
  (2, 'Soporte Técnico', 'turno', 15, FALSE, 'Turno virtual inmediato para consultas técnicas y banca móvil.', TRUE),
  (3, 'Atención General', 'turno_y_cita', 20, FALSE, 'Atención presencial en ventanilla o agendamiento con cita previa.', TRUE),
  (4, 'Asesoría Financiera', 'cita', 30, TRUE, 'Planificación de inversiones, CDT y gestión de patrimonios.', TRUE),
  (5, 'Atención Especializada', 'cita', 60, TRUE, 'Consultoría empresarial, comercio exterior y trámites avanzados.', TRUE)
ON DUPLICATE KEY UPDATE
  modalidad = VALUES(modalidad),
  duracion_estimada_min = VALUES(duracion_estimada_min),
  requiere_tema = VALUES(requiere_tema),
  descripcion = VALUES(descripcion);
