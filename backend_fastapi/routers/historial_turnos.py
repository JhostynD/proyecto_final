from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from database import obtener_conexion

router = APIRouter(prefix="/historial-turnos", tags=["Historial de Turnos"])


class HistorialTurnoResponse(BaseModel):
    id: int
    turno_id: int
    estado_anterior: Optional[str] = None
    estado_nuevo: str
    fecha_cambio: str


@router.get("/", response_model=List[HistorialTurnoResponse])
def listar_historial():
    """Obtiene todo el historial de cambios de estado con los nombres de los estados."""
    conn = obtener_conexion()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            h.id,
            h.turno_id,
            ea.nombre AS estado_anterior,
            en.nombre AS estado_nuevo,
            h.fecha_cambio
        FROM historial_turnos h
        LEFT JOIN estados_turno ea ON h.estado_anterior_id = ea.id
        INNER JOIN estados_turno en ON h.estado_nuevo_id = en.id
        ORDER BY h.fecha_cambio DESC
    """)
    historial = cursor.fetchall()
    conn.close()
    return [dict(registro) for registro in historial]


@router.get("/turno/{turno_id}", response_model=List[HistorialTurnoResponse])
def obtener_historial_por_turno(turno_id: int):
    """Obtiene el historial de cambios para un turno específico."""
    conn = obtener_conexion()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM turnos WHERE id = ?", (turno_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"El turno con ID {turno_id} no existe.",
        )

    cursor.execute("""
        SELECT 
            h.id,
            h.turno_id,
            ea.nombre AS estado_anterior,
            en.nombre AS estado_nuevo,
            h.fecha_cambio
        FROM historial_turnos h
        LEFT JOIN estados_turno ea ON h.estado_anterior_id = ea.id
        INNER JOIN estados_turno en ON h.estado_nuevo_id = en.id
        WHERE h.turno_id = ?
        ORDER BY h.fecha_cambio DESC
    """, (turno_id,))

    historial = cursor.fetchall()
    conn.close()
    return [dict(registro) for registro in historial]