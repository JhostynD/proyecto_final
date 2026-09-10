from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import List
from database import obtener_conexion

router = APIRouter(prefix="/roles", tags=["Roles"])


class RolResponse(BaseModel):
    id: int
    nombre: str


@router.get("/", response_model=List[RolResponse])
def listar_roles():
    """Obtiene el catálogo completo de roles."""
    conn = obtener_conexion()
    cursor = conn.cursor()
    cursor.execute("SELECT id, nombre FROM roles")
    roles = cursor.fetchall()
    conn.close()
    return [dict(rol) for rol in roles]


@router.get("/{rol_id}", response_model=RolResponse)
def obtener_rol(rol_id: int):
    """Obtiene un rol específico por su ID."""
    conn = obtener_conexion()
    cursor = conn.cursor()
    cursor.execute("SELECT id, nombre FROM roles WHERE id = ?", (rol_id,))
    rol = cursor.fetchone()
    conn.close()

    if not rol:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rol no encontrado",
        )
    return dict(rol)