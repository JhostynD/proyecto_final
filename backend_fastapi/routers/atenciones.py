from database import obtener_conexion  # Importa la función para abrir la conexión a SQLite[cite: 1]
from fastapi import APIRouter, Depends, HTTPException  # Importa las utilidades necesarias de FastAPI[cite: 1]
from schemas import (
    AtencionCreate,
    AtencionResponse,
)  # Importa los esquemas de validación de Pydantic[cite: 1]
from seguridad import (
    obtener_usuario_actual,
    verificar_admin,
)  # Importa las dependencias de seguridad y JWT[cite: 1]

# Crea el enrutador para agrupar las rutas bajo /atenciones en la documentación
router = APIRouter(prefix="/atenciones", tags=["Atenciones"])


# --- ENDPOINT 1: LISTAR TODAS LAS ATENCIONES (PÚBLICO) ---
@router.get("", response_model=list[AtencionResponse])
def listar_atenciones():
    conexion = obtener_conexion()  # Abre la conexión con la BD
    cursor = conexion.cursor()  # Crea el cursor para ejecutar sentencias SQL
    cursor.execute("SELECT * FROM atenciones")  # Realiza la consulta
    atenciones = cursor.fetchall()  # Recupera todos los registros encontrados
    conexion.close()  # Cierra la conexión liberando recursos
    return [
        dict(a) for a in atenciones
    ]  # Convierte cada fila a diccionario y la retorna


# --- ENDPOINT 2: OBTENER UNA ATENCIÓN POR ID (PÚBLICO) ---
@router.get("/{atencion_id}", response_model=AtencionResponse)
def obtener_atencion(atencion_id: int):
    conexion = obtener_conexion()  # Abre la conexión con la BD
    cursor = conexion.cursor()  # Crea el cursor
    cursor.execute(
        "SELECT * FROM atenciones WHERE id = ?", (atencion_id,)
    )  # Busca la atención por su ID
    atencion = cursor.fetchone()  # Recupera el registro
    conexion.close()  # Cierra la conexión

    if not atencion:  # Si la atención no existe
        raise HTTPException(
            status_code=404, detail="Atención no encontrada"
        )  # Lanza un error HTTP 404[cite: 1]

    return dict(atencion)  # Retorna la atención encontrada convertida a diccionario


# --- ENDPOINT 3: CREAR UNA NUEVA ATENCIÓN (REQUIERE AUTENTICACIÓN) ---
@router.post("", response_model=AtencionResponse, status_code=201)
def crear_atencion(
    atencion: AtencionCreate,  # Valida la entrada mediante el esquema Pydantic
    usuario_actual: dict = Depends(
        obtener_usuario_actual
    ),  # Protege la ruta: exige token JWT válido[cite: 1]
):
    conexion = obtener_conexion()  # Abre la conexión
    cursor = conexion.cursor()  # Crea el cursor

    # Regla de Integridad GA6: Validar si el turno_id existe antes de asociarlo[cite: 1]
    cursor.execute(
        "SELECT id FROM turnos WHERE id = ?", (atencion.turno_id,)
    )
    if not cursor.fetchone():  # Si el turno padre no existe
        conexion.close()  # Cierra la conexión
        raise HTTPException(
            status_code=400, detail="El turno especificado no existe"
        )  # Lanza 400 Bad Request[cite: 1]

    # Inserta la atención con consulta parametrizada
    cursor.execute(
        """
        INSERT INTO atenciones (turno_id, modulo, observacion)
        VALUES (?, ?, ?)
    """,
        (atencion.turno_id, atencion.modulo, atencion.observacion),
    )

    conexion.commit()  # Aplica y guarda los cambios en la BD[cite: 1]
    nuevo_id = cursor.lastrowid  # Obtiene el ID generado por autoincremento

    cursor.execute(
        "SELECT * FROM atenciones WHERE id = ?", (nuevo_id,)
    )  # Consulta la nueva atención creada
    nueva_atencion = cursor.fetchone()  # Recupera el objeto completo
    conexion.close()  # Cierra la conexión

    return dict(nueva_atencion)  # Retorna el nuevo registro con código HTTP 201


# --- ENDPOINT 4: ACTUALIZAR UNA ATENCIÓN (REQUIERE AUTENTICACIÓN) ---
@router.put("/{atencion_id}", response_model=AtencionResponse)
def actualizar_atencion(
    atencion_id: int,  # ID capturado desde la URL
    atencion: AtencionCreate,  # Datos recibidos en el cuerpo
    usuario_actual: dict = Depends(
        obtener_usuario_actual
    ),  # Exige token JWT de sesión activa[cite: 1]
):
    conexion = obtener_conexion()  # Abre la conexión
    cursor = conexion.cursor()  # Crea el cursor

    # Validar si el nuevo turno_id asignado existe
    cursor.execute(
        "SELECT id FROM turnos WHERE id = ?", (atencion.turno_id,)
    )
    if not cursor.fetchone():  # Si el turno no existe
        conexion.close()  # Cierra la conexión
        raise HTTPException(
            status_code=400, detail="El turno especificado no existe"
        )  # Lanza 400 Bad Request[cite: 1]

    # Ejecuta la actualización parametrizada
    cursor.execute(
        """
        UPDATE atenciones
        SET turno_id = ?, modulo = ?, observacion = ?
        WHERE id = ?
    """,
        (atencion.turno_id, atencion.modulo, atencion.observacion, atencion_id),
    )

    conexion.commit()  # Confirma los cambios
    filas = cursor.rowcount  # Almacena el total de filas modificadas

    if filas == 0:  # Si no afectó ninguna fila, la atención no existía
        conexion.close()  # Cierra la conexión
        raise HTTPException(
            status_code=404, detail="Atención no encontrada"
        )  # Lanza error 404[cite: 1]

    cursor.execute(
        "SELECT * FROM atenciones WHERE id = ?", (atencion_id,)
    )  # Obtiene los datos actualizados
    atencion_actualizada = cursor.fetchone()  # Recupera la fila
    conexion.close()  # Cierra la conexión

    return dict(atencion_actualizada)  # Retorna la atención modificada


# --- ENDPOINT 5: ELIMINAR UNA ATENCIÓN (EXCLUSIVO ADMIN) ---
@router.delete("/{atencion_id}")
def eliminar_atencion(
    atencion_id: int,
    usuario_admin: dict = Depends(
        verificar_admin
    ),  # Restringe la acción: exige rol admin (403 si falla)[cite: 1]
):
    conexion = obtener_conexion()  # Abre la conexión
    cursor = conexion.cursor()  # Crea el cursor

    cursor.execute(
        "DELETE FROM atenciones WHERE id = ?", (atencion_id,)
    )  # Elimina el registro por ID
    conexion.commit()  # Confirma la eliminación
    filas = cursor.rowcount  # Obtiene la cantidad de filas borradas
    conexion.close()  # Cierra la conexión

    if filas == 0:  # Si no borró nada
        raise HTTPException(
            status_code=404, detail="Atención no encontrada"
        )  # Retorna 404 Not Found[cite: 1]

    return {
        "mensaje": "Atención eliminada exitosamente"
    }  # Retorna mensaje de confirmación