import { db } from './db.js';

// -------------------------------------------------------------
// GESTOR DE CONEXIONES EN TIEMPO REAL (SSE - Server-Sent Events)
// Mantiene mapas de conexiones activas indexadas por usuarioId.
// Seguro: autenticado por cabecera Bearer, no expone JWT en URL.
//
// NOTA DE ARQUITECTURA MULTI-PROCESO:
// El hub 'clientesSSE' es un mapa en memoria por proceso. En la arquitectura
// actual de instancia única, gestiona eficientemente todas las conexiones.
// Si el backend se escala horizontalmente en múltiples instancias o procesos
// (cluster de Node / réplicas Kubernetes), se requerirá un adaptador Pub/Sub
// centralizado (ej. Redis Pub/Sub) para distribuir eventos entre trabajadores,
// o configurar afinidad de sesión (sticky sessions).
// -------------------------------------------------------------
const clientesSSE = new Map(); // usuarioId (number) -> Set<{ res, exp, jti, usuarioId }>

/**
 * Registra una nueva conexión SSE para un usuario autenticado.
 * Guarda referencia al tiempo de expiración (exp) y jti del token para
 * desautorización proactiva.
 */
export function agregarClienteSSE(usuarioId, res, payload = {}) {
  const idNum = Number(usuarioId);
  if (!idNum) return;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Evita buffering en proxies Nginx
  });

  // Enviar evento de conexión inicial exitosa
  res.write(`event: conectado\ndata: ${JSON.stringify({ ok: true, usuarioId: idNum, tiempo: new Date().toISOString() })}\n\n`);

  if (!clientesSSE.has(idNum)) {
    clientesSSE.set(idNum, new Set());
  }

  const registroCliente = {
    res,
    usuarioId: idNum,
    exp: Number(payload?.exp) || null,
    jti: payload?.jti || null
  };

  clientesSSE.get(idNum).add(registroCliente);

  // Manejar cierre o desconexión del cliente
  const limpiar = () => {
    const clientes = clientesSSE.get(idNum);
    if (clientes) {
      clientes.delete(registroCliente);
      if (clientes.size === 0) {
        clientesSSE.delete(idNum);
      }
    }
  };

  res.on('close', limpiar);
  res.on('finish', limpiar);
}

/**
 * Cierra proactivamente todas las conexiones SSE abiertas de un usuario
 * (utilizado en logout, suspensión de cuenta, eliminación o revocación).
 */
export function cerrarClientesSSE(usuarioId, motivo = 'autorizacion_revocada') {
  const idNum = Number(usuarioId);
  const clientes = clientesSSE.get(idNum);
  if (!clientes || clientes.size === 0) return 0;

  let cerrados = 0;
  for (const cliente of clientes) {
    try {
      cliente.res.write(`event: sesion_cerrada\ndata: ${JSON.stringify({ motivo, usuarioId: idNum })}\n\n`);
      cliente.res.end();
      cerrados++;
    } catch {
      // Ignorar si el socket ya estaba cerrado
    }
  }
  clientesSSE.delete(idNum);
  return cerrados;
}

/**
 * Emite una notificación en tiempo real exclusivamente a los clientes activos
 * de un usuario determinado.
 */
export function emitirNotificacionSSE(usuarioId, notificacion) {
  const idNum = Number(usuarioId);
  const clientes = clientesSSE.get(idNum);
  if (!clientes || clientes.size === 0) return 0;

  const ahoraSeg = Date.now() / 1000;
  const eventoPayload = `event: notificacion\ndata: ${JSON.stringify(notificacion)}\n\n`;
  let enviados = 0;
  for (const cliente of Array.from(clientes)) {
    // Si el token JWT con el que abrió la conexión ya expiró, cerrar proactivamente
    if (cliente.exp && ahoraSeg >= cliente.exp) {
      try {
        cliente.res.write(`event: sesion_cerrada\ndata: ${JSON.stringify({ motivo: 'token_expirado', usuarioId: idNum })}\n\n`);
        cliente.res.end();
      } catch {
        // Ignorar socket cerrado
      }
      clientes.delete(cliente);
      continue;
    }

    try {
      cliente.res.write(eventoPayload);
      enviados++;
    } catch {
      // Si la conexión falló, se limpiará en el listener 'close'
      clientes.delete(cliente);
    }
  }
  if (clientes.size === 0) {
    clientesSSE.delete(idNum);
  }
  return enviados;
}

// Heartbeat periódico (cada 25s): mantiene vivos los túneles y expulsa tokens vencidos
const heartbeatInterval = setInterval(() => {
  const ahoraSeg = Date.now() / 1000;

  for (const [idNum, clientes] of clientesSSE.entries()) {
    for (const cliente of Array.from(clientes)) {
      // Si el token JWT con el que abrió el stream ya expiró, cerrar la conexión
      if (cliente.exp && ahoraSeg >= cliente.exp) {
        try {
          cliente.res.write(`event: sesion_cerrada\ndata: ${JSON.stringify({ motivo: 'token_expirado' })}\n\n`);
          cliente.res.end();
        } catch {
          // Ignorar socket cerrado
        }
        clientes.delete(cliente);
      } else {
        try {
          cliente.res.write(': keepalive\n\n');
        } catch {
          clientes.delete(cliente);
        }
      }
    }

    if (clientes.size === 0) {
      clientesSSE.delete(idNum);
    }
  }
}, 25 * 1000);

if (heartbeatInterval.unref) {
  heartbeatInterval.unref();
}

/**
 * Genera el contenido semántico y amigable de la notificación según el nuevo estado.
 */
function construirContenidoNotificacion(nuevoEstado, codigoTurno, nombreServicio) {
  const refTurno = codigoTurno ? `Turno ${codigoTurno}` : 'Tu turno';
  const detalleServicio = nombreServicio ? ` para el servicio "${nombreServicio}"` : '';

  switch (nuevoEstado) {
    case 'confirmado':
      return {
        tipoEvento: 'turno_confirmado',
        titulo: 'Turno confirmado',
        mensaje: `${refTurno} ha sido confirmado con éxito${detalleServicio}. Revisa los detalles en tu panel.`
      };
    case 'cancelado':
      return {
        tipoEvento: 'turno_cancelado',
        titulo: 'Turno cancelado',
        mensaje: `${refTurno} ha sido cancelado${detalleServicio}. Si requieres atención, puedes solicitar un nuevo turno.`
      };
    case 'completado':
      return {
        tipoEvento: 'turno_completado',
        titulo: 'Atención completada',
        mensaje: `La atención de ${refTurno} ha finalizado${detalleServicio}. Gracias por usar FILA CERO.`
      };
    default:
      return null;
  }
}

/**
 * Registra una notificación en base de datos dentro de una transacción activa o conexión pool.
 * Devuelve la notificación y un callback para emitir el evento en memoria tras commit exitoso.
 */
export async function registrarNotificacionEstado(connOdb, {
  turnoId,
  nuevoEstado,
  estadoAnterior,
  usuarioId,
  codigoTurno,
  nombreServicio
}) {
  // 1. Evitar duplicados si el estado solicitado es idéntico al actual
  if (nuevoEstado === estadoAnterior) {
    return null;
  }

  // 2. Solo notificar para los estados acordados: confirmado, cancelado, completado
  const contenido = construirContenidoNotificacion(nuevoEstado, codigoTurno, nombreServicio);
  if (!contenido) {
    return null;
  }

  const idUsuarioNum = Number(usuarioId);
  if (!idUsuarioNum) {
    return null;
  }

  // 3. Persistir en la tabla notificaciones
  const [result] = await connOdb.execute(
    `INSERT INTO notificaciones (usuario_id, turno_id, tipo_evento, titulo, mensaje)
     VALUES (?, ?, ?, ?, ?)`,
    [idUsuarioNum, turnoId || null, contenido.tipoEvento, contenido.titulo, contenido.mensaje]
  );

  const notificacionCreada = {
    id: result.insertId,
    usuario_id: idUsuarioNum,
    turno_id: turnoId || null,
    tipo_evento: contenido.tipoEvento,
    titulo: contenido.titulo,
    mensaje: contenido.mensaje,
    leido: 0,
    leido_en: null,
    creado_en: new Date().toISOString()
  };

  return {
    notificacion: notificacionCreada,
    // Llamar a emitir() ÚNICAMENTE después de conn.commit() exitoso
    emitir: () => emitirNotificacionSSE(idUsuarioNum, notificacionCreada)
  };
}

/**
 * Retorna el número de clientes activos en memoria (útil para pruebas y monitoreo).
 */
export function contarClientesConectados(usuarioId = null) {
  if (usuarioId !== null) {
    return clientesSSE.get(Number(usuarioId))?.size || 0;
  }
  let total = 0;
  for (const set of clientesSSE.values()) total += set.size;
  return total;
}
