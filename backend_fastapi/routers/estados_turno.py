from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import List
from database import obtener_conexion

router = APIRouter(prefix="/estados-turno", tags=["Estados de Turno"])


class EstadoTurnoResponse(BaseModel):
    id: int
    nombre: str


@router.get("/", response_model=List[EstadoTurnoResponse])
def listar_estados_turno():
    """Obtiene el catálogo completo de estados de turno."""
    conn = obtener_conexion()
    cursor = conn.cursor()
    cursor.execute("SELECT id, nombre FROM estados_turno")
    estados = cursor.fetchall()
    conn.close()
    return [dict(estado) for estado in estados]


@router.get("/{estado_id}", response_model=EstadoTurnoResponse)
def obtener_estado_turno(estado_id: int):
    """Obtiene un estado de turno específico por su ID."""
    conn = obtener_conexion()
    cursor = conn.cursor()
    cursor.execute("SELECT id, nombre FROM estados_turno WHERE id = ?", (estado_id,))
    estado = cursor.fetchone()
    conn.close()

    if not estado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estado de turno no encontrado",
        )
    return dict(estado)