CREATE DATABASE IF NOT EXISTS turnos_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE turnos_db;

CREATE TABLE usuarios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  correo VARCHAR(150) NOT NULL UNIQUE,
  contraseña VARCHAR(255) NOT NULL,
  rol ENUM('usuario', 'admin') NOT NULL DEFAULT 'usuario',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE servicios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE turnos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  servicio_id INT UNSIGNED NOT NULL,
  fecha DATE NOT NULL,
  hora TIME NOT NULL,
  estado ENUM('pendiente', 'confirmado', 'cancelado', 'completado') NOT NULL DEFAULT 'pendiente',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_turnos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_turnos_servicio FOREIGN KEY (servicio_id) REFERENCES servicios(id),
  CONSTRAINT turno_horario_unico UNIQUE (fecha, hora)
);

INSERT IGNORE INTO servicios (nombre) VALUES
  ('Asesoría'),
  ('Soporte Técnico'),
  ('Atención General');
