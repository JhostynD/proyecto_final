# Importa la función que permite abrir una conexión con la base de datos SQLite.
from database import obtener_conexion

# Importa herramientas de FastAPI:
# APIRouter permite crear un grupo de rutas/endpoints.
# Depends permite utilizar dependencias, como la autenticación.
# HTTPException permite devolver errores HTTP personalizados.
from fastapi import APIRouter, Depends, HTTPException

# Importa los esquemas de Pydantic utilizados para validar
# los datos que entran y salen de los endpoints.
from schemas import (
    TurnoConAtencionesResponse,  # Esquema para devolver un turno con sus atenciones.
    TurnoCreate,                 # Esquema para crear o actualizar un turno.
    TurnoResponse,               # Esquema para devolver la información de un turno.
)

# Importa las funciones encargadas de verificar la autenticación
# y los permisos del usuario.
from seguridad import (
    obtener_usuario_actual,  # Verifica que exista un usuario autenticado mediante JWT.
    verificar_admin,         # Verifica que el usuario tenga rol de administrador.
)


# Crea el enrutador de FastAPI.
# prefix="/turnos" significa que todas las rutas de este archivo
# comenzarán con /turnos.
# tags=["Turnos"] agrupa estos endpoints bajo "Turnos" en Swagger /docs.
router = APIRouter(prefix="/turnos", tags=["Turnos"])



# Define una petición GET en /turnos.
# response_model indica que la respuesta será una lista
# de objetos que cumplen con el esquema TurnoResponse.
@router.get("", response_model=list[TurnoResponse])
def listar_turnos():

    # Abre una conexión con la base de datos SQLite.
    conexion = obtener_conexion()

    # Crea un cursor.
    # El cursor permite ejecutar consultas SQL sobre la base de datos.
    cursor = conexion.cursor()

    # Ejecuta una consulta SQL para obtener todos los registros
    # almacenados en la tabla turnos.
    cursor.execute("SELECT * FROM turnos")

    # Obtiene todas las filas que devolvió la consulta.
    turnos = cursor.fetchall()

    # Cierra la conexión con la base de datos
    # porque ya no se necesita.
    conexion.close()

    # Convierte cada fila de SQLite en un diccionario.
    # Luego devuelve todos los turnos como una lista.
    return [dict(t) for t in turnos]


# Define una petición GET en /turnos/{turno_id}.
# {turno_id} representa el identificador del turno que queremos consultar.
# response_model indica que se devolverá un TurnoResponse.
@router.get("/{turno_id}", response_model=TurnoResponse)
def obtener_turno(turno_id: int):

    # Abre la conexión con la base de datos.
    conexion = obtener_conexion()

    # Crea el cursor para ejecutar consultas SQL.
    cursor = conexion.cursor()

    # Busca en la tabla turnos el registro cuyo ID
    # coincida con el turno_id recibido.
    #
    # El signo ? funciona como parámetro de la consulta.
    # Esto evita insertar directamente el valor dentro del SQL.
    cursor.execute(
        "SELECT * FROM turnos WHERE id = ?",
        (turno_id,)
    )

    # Obtiene la primera fila encontrada.
    turno = cursor.fetchone()

    # Cierra la conexión con la base de datos.
    conexion.close()

    # Comprueba si no se encontró ningún turno.
    if not turno:

        # Si no existe, genera un error HTTP 404.
        raise HTTPException(
            status_code=404,
            detail="Turno no encontrado"
        )

    # Convierte la fila de SQLite en un diccionario
    # y devuelve la información del turno.
    return dict(turno)


# Define una petición POST en /turnos.
#
# response_model=TurnoResponse indica el formato de la respuesta.
# status_code=201 indica que el recurso fue creado correctamente.
@router.post("", response_model=TurnoResponse, status_code=201)
def crear_turno(
    # Recibe los datos del nuevo turno.
    # TurnoCreate se encarga de validar que los datos
    # tengan la estructura esperada.
    turno: TurnoCreate,

    # Depends ejecuta obtener_usuario_actual antes de permitir
    # que se ejecute el endpoint.
    #
    # Esto obliga al usuario a estar autenticado mediante JWT.
    usuario_actual: dict = Depends(obtener_usuario_actual)
):

    # Abre una conexión con la base de datos.
    conexion = obtener_conexion()

    # Crea el cursor para ejecutar SQL.
    cursor = conexion.cursor()

    # Inserta un nuevo registro en la tabla turnos.
    #
    # Los signos ? son parámetros que posteriormente
    # reciben los valores del turno.
    cursor.execute(
        """
        INSERT INTO turnos (numero, nombre_cliente, estado)
        VALUES (?, ?, ?)
        """,

        # Valores que serán insertados en la base de datos.
        (
            turno.numero,
            turno.nombre_cliente,
            turno.estado
        ),
    )

    # Confirma la operación y guarda definitivamente
    # el nuevo registro en la base de datos.
    conexion.commit()

    # Obtiene el ID generado automáticamente
    # por la base de datos.
    nuevo_id = cursor.lastrowid

    # Busca nuevamente el turno recién creado utilizando
    # el ID que acabamos de obtener.
    cursor.execute(
        "SELECT * FROM turnos WHERE id = ?",
        (nuevo_id,)
    )

    # Recupera el registro completo del nuevo turno.
    nuevo_turno = cursor.fetchone()

    # Cierra la conexión con la base de datos.
    conexion.close()

    # Convierte el registro en diccionario y lo devuelve.
    # Como el endpoint tiene status_code=201,
    # la respuesta será HTTP 201 Created.
    return dict(nuevo_turno)


# Define una petición PUT.
#
# La URL será:
# /turnos/{turno_id}
#
# PUT normalmente se utiliza para actualizar un recurso existente.
@router.put("/{turno_id}", response_model=TurnoResponse)
def actualizar_turno(

    # Recibe el ID del turno desde la URL.
    # int indica que debe ser un número entero.
    turno_id: int,

    # Recibe los nuevos datos del turno.
    # TurnoCreate valida la información recibida.
    turno: TurnoCreate,

    # Comprueba que exista un usuario autenticado.
    # Se utiliza el sistema de autenticación JWT.
    usuario_actual: dict = Depends(obtener_usuario_actual)
):

    # Abre la conexión con SQLite.
    conexion = obtener_conexion()

    # Crea el cursor para ejecutar SQL.
    cursor = conexion.cursor()

    # Actualiza los datos del turno cuyo ID coincida
    # con el turno_id recibido.
    cursor.execute(
        """
        UPDATE turnos
        SET numero = ?, nombre_cliente = ?, estado = ?
        WHERE id = ?
        """,

        # Valores que se colocarán en las columnas.
        (
            turno.numero,
            turno.nombre_cliente,
            turno.estado,
            turno_id
        ),
    )

    # Guarda los cambios realizados en la base de datos.
    conexion.commit()

    # Obtiene la cantidad de filas modificadas.
    filas = cursor.rowcount

    # Si no se modificó ninguna fila,
    # significa que probablemente el ID no existe.
    if filas == 0:

        # Cierra la conexión antes de generar el error.
        conexion.close()

        # Devuelve un error HTTP 404.
        raise HTTPException(
            status_code=404,
            detail="Turno no encontrado"
        )

    # Busca nuevamente el turno utilizando su ID
    # para obtener los datos actualizados.
    cursor.execute(
        "SELECT * FROM turnos WHERE id = ?",
        (turno_id,)
    )

    # Recupera el turno actualizado.
    turno_actualizado = cursor.fetchone()

    # Cierra la conexión.
    conexion.close()

    # Convierte la fila a diccionario
    # y devuelve el turno actualizado.
    return dict(turno_actualizado)


# ============================================================
# ENDPOINT 5: ELIMINAR UN TURNO
# ============================================================

# Define una petición DELETE.
#
# La ruta será:
# /turnos/{turno_id}
@router.delete("/{turno_id}")
def eliminar_turno(

    # Recibe el ID del turno que se quiere eliminar.
    turno_id: int,

    # Antes de ejecutar el endpoint se llama a verificar_admin.
    #
    # Esto significa que solamente un usuario con rol
    # administrador puede ejecutar esta operación.
    usuario_admin: dict = Depends(verificar_admin)
):

    # Abre la conexión con la base de datos.
    conexion = obtener_conexion()

    # Crea el cursor para ejecutar las consultas SQL.
    cursor = conexion.cursor()


   

    # Busca únicamente el ID del turno.
    cursor.execute(
        "SELECT id FROM turnos WHERE id = ?",
        (turno_id,)
    )

    # Si fetchone() no encuentra ningún registro,
    # devuelve None.
    if not cursor.fetchone():

        # Cierra la conexión.
        conexion.close()

        # Devuelve un error 404 porque el turno no existe.
        raise HTTPException(
            status_code=404,
            detail="Turno no encontrado"
        )



    # Cuenta cuántos registros de la tabla atenciones
    # están relacionados con este turno.
    cursor.execute(
        "SELECT COUNT(*) FROM atenciones WHERE turno_id = ?",
        (turno_id,)
    )

    # Obtiene el número de atenciones.
    #
    # fetchone()[0] obtiene el primer valor de la fila,
    # que corresponde al COUNT(*).
    if cursor.fetchone()[0] > 0:

        # Si existe al menos una atención asociada,
        # no se permite eliminar el turno.
        conexion.close()

        # Devuelve un error HTTP 400.
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar el turno porque tiene atenciones asociadas",
        )



    # Si el turno existe y no tiene atenciones asociadas,
    # se elimina de la tabla turnos.
    cursor.execute(
        "DELETE FROM turnos WHERE id = ?",
        (turno_id,)
    )

    # Guarda definitivamente la eliminación.
    conexion.commit()

    # Cierra la conexión.
    conexion.close()

    # Devuelve un mensaje confirmando que el turno
    # fue eliminado correctamente.
    return {
        "mensaje": "Turno eliminado exitosamente"
    }


# Define una petición GET para consultar un turno
# junto con las atenciones relacionadas con él.
#
# Ejemplo:
# GET /turnos/5/atenciones
#
# response_model indica que la respuesta debe cumplir
# con TurnoConAtencionesResponse.
@router.get(
    "/{turno_id}/atenciones",
    response_model=TurnoConAtencionesResponse
)
def obtener_turno_con_atenciones(turno_id: int):

    # Abre la conexión con la base de datos.
    conexion = obtener_conexion()

    # Crea el cursor para ejecutar las consultas SQL.
    cursor = conexion.cursor()



    # Busca el turno principal utilizando su ID.
    cursor.execute(
        "SELECT * FROM turnos WHERE id = ?",
        (turno_id,)
    )

    # Recupera el turno encontrado.
    turno = cursor.fetchone()

    # Comprueba si el turno existe.
    if not turno:

        # Cierra la conexión.
        conexion.close()

        # Devuelve un error 404 si no existe.
        raise HTTPException(
            status_code=404,
            detail="Turno no encontrado"
        )



    # Realiza una consulta JOIN para obtener
    # las atenciones relacionadas con el turno.
    #
    # "a" representa la tabla atenciones.
    # "t" representa la tabla turnos.
    #
    # La relación se establece mediante:
    # t.id = a.turno_id
    cursor.execute(
        """
        SELECT
            a.id,
            a.turno_id,
            a.modulo,
            a.fecha_atencion,
            a.observacion
        FROM atenciones a
        JOIN turnos t ON t.id = a.turno_id
        WHERE t.id = ?
        """,
        (turno_id,),
    )

    # Recupera todas las atenciones relacionadas
    # con el turno.
    atenciones = cursor.fetchall()

    # Cierra la conexión porque ya se terminaron las consultas.
    conexion.close()


    # Convierte la información del turno
    # de sqlite3.Row a un diccionario.
    resultado = dict(turno)

    # Crear una nueva propiedad llamada "atenciones".
    # Cada atención también se convierte en diccionario.
    resultado["atenciones"] = [
        dict(a) for a in atenciones
    ]

    # Devuelve el turno junto con todas sus atenciones.
    return resultado