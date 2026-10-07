const mysql = require('./node_modules/mysql2/promise');
const dotenv = require('./node_modules/dotenv');
dotenv.config();

async function migrar() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'turnos_db'
  });

  console.log('--- Iniciando Migración Segura en turnos_db ---');

  try {
    // 1. Columnas en servicios
    const [colsServicios] = await conn.query('DESCRIBE servicios');
    const nombresColsServicios = colsServicios.map(c => c.Field);

    if (!nombresColsServicios.includes('modalidad')) {
      await conn.query("ALTER TABLE servicios ADD COLUMN modalidad ENUM('turno', 'cita', 'turno_y_cita') NOT NULL DEFAULT 'cita' AFTER nombre");
      console.log('✓ Columna modalidad agregada a servicios.');
    }

    if (!nombresColsServicios.includes('requiere_tema')) {
      await conn.query("ALTER TABLE servicios ADD COLUMN requiere_tema BOOLEAN NOT NULL DEFAULT FALSE AFTER duracion_estimada_min");
      console.log('✓ Columna requiere_tema agregada a servicios.');
    }

    if (!nombresColsServicios.includes('descripcion')) {
      await conn.query("ALTER TABLE servicios ADD COLUMN descripcion VARCHAR(255) NULL AFTER requiere_tema");
      console.log('✓ Columna descripcion agregada a servicios.');
    }

    // Actualizar y asegurar servicios con modalidades y duraciones reales
    await conn.query(`
      UPDATE servicios SET 
        nombre = 'Asesoría de Crédito', 
        modalidad = 'cita', 
        duracion_estimada_min = 30, 
        requiere_tema = TRUE,
        descripcion = 'Asesoría personalizada para productos de crédito, libranzas y préstamos.'
      WHERE id = 1
    `);

    await conn.query(`
      UPDATE servicios SET 
        nombre = 'Soporte Técnico', 
        modalidad = 'turno', 
        duracion_estimada_min = 15, 
        requiere_tema = FALSE,
        descripcion = 'Turno virtual inmediato para consultas técnicas y banca móvil.'
      WHERE id = 2
    `);

    await conn.query(`
      UPDATE servicios SET 
        nombre = 'Atención General', 
        modalidad = 'turno_y_cita', 
        duracion_estimada_min = 20, 
        requiere_tema = FALSE,
        descripcion = 'Atención presencial en ventanilla o agendamiento con cita previa.'
      WHERE id = 3
    `);

    // Insertar servicios adicionales requeridos si no existen
    await conn.query(`
      INSERT INTO servicios (id, nombre, modalidad, duracion_estimada_min, requiere_tema, descripcion, activo)
      VALUES 
        (4, 'Asesoría Financiera', 'cita', 30, TRUE, 'Planificación de inversiones, CDT y gestión de patrimonios.', TRUE),
        (5, 'Atención Especializada', 'cita', 60, TRUE, 'Consultoría empresarial, comercio exterior y trámites avanzados.', TRUE)
      ON DUPLICATE KEY UPDATE
        modalidad = VALUES(modalidad),
        duracion_estimada_min = VALUES(duracion_estimada_min),
        requiere_tema = VALUES(requiere_tema),
        descripcion = VALUES(descripcion)
    `);
    console.log('✓ Servicios bancarios configurados con duraciones y modalidades.');

    // 2. Columnas en turnos
    const [colsTurnos] = await conn.query('DESCRIBE turnos');
    const nombresColsTurnos = colsTurnos.map(c => c.Field);

    if (!nombresColsTurnos.includes('modalidad')) {
      await conn.query("ALTER TABLE turnos ADD COLUMN modalidad ENUM('turno', 'cita') NOT NULL DEFAULT 'cita' AFTER servicio_id");
      console.log('✓ Columna modalidad agregada a turnos.');
    }

    if (!nombresColsTurnos.includes('motivo')) {
      await conn.query("ALTER TABLE turnos ADD COLUMN motivo VARCHAR(255) NULL AFTER codigo_turno");
      console.log('✓ Columna motivo agregada a turnos.');
    }

    if (!nombresColsTurnos.includes('checkin_en')) {
      await conn.query("ALTER TABLE turnos ADD COLUMN checkin_en DATETIME NULL AFTER modulo");
      console.log('✓ Columna checkin_en agregada a turnos.');
    }

    if (!nombresColsTurnos.includes('llamado_en')) {
      await conn.query("ALTER TABLE turnos ADD COLUMN llamado_en DATETIME NULL AFTER checkin_en");
      console.log('✓ Columna llamado_en agregada a turnos.');
    }

    if (!nombresColsTurnos.includes('atencion_inicio_en')) {
      await conn.query("ALTER TABLE turnos ADD COLUMN atencion_inicio_en DATETIME NULL AFTER llamado_en");
      console.log('✓ Columna atencion_inicio_en agregada a turnos.');
    }

    if (!nombresColsTurnos.includes('atencion_fin_en')) {
      await conn.query("ALTER TABLE turnos ADD COLUMN atencion_fin_en DATETIME NULL AFTER atencion_inicio_en");
      console.log('✓ Columna atencion_fin_en agregada a turnos.');
    }

    // 3. Modificación de índices en turnos
    const [indexes] = await conn.query('SHOW INDEX FROM turnos');
    const indexNames = indexes.map(i => i.Key_name);

    if (indexNames.includes('turno_servicio_horario_unico')) {
      await conn.query('ALTER TABLE turnos DROP INDEX turno_servicio_horario_unico');
      console.log('✓ Índice turno_servicio_horario_unico removido para permitir turnos virtuales concurrentes y validación de intervalos por servicio.');
    }

    if (!indexNames.includes('idx_turnos_fecha_estado')) {
      await conn.query('ALTER TABLE turnos ADD INDEX idx_turnos_fecha_estado (fecha, estado, servicio_id)');
      console.log('✓ Índice idx_turnos_fecha_estado creado para consultas rápidas de cola.');
    }

    // Asegurar formato de datos existentes
    await conn.query("UPDATE turnos SET modalidad = 'cita' WHERE modalidad IS NULL OR modalidad = ''");

    console.log('--- Migración completada exitosamente sin pérdida de datos ---');
  } catch (err) {
    console.error('Error durante la migración:', err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

migrar();
