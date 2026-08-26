import sqlite3  # Para capturar errores de integridad de la base de datos (correo duplicado)
from database import obtener_conexion  # Función para abrir conexión a la BD de SQLite
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)  # Utilidades de FastAPI para rutas, dependencias y errores
import schemas  # Modelos Pydantic para validar entradas y dar formato a las respuestas
from seguridad import (  # Funciones de autenticación, hashes y verificación de tokens JWT
    crear_access_token,
    obtener_password_hash,
    obtener_usuario_actual,
    verificar_admin,
    verificar_password,
)

# Instancia del enrutador modular de FastAPI
router = APIRouter()


# ==============================================================================
# 1. REGISTRAR USUARIO (Endpoint público)
# ==============================================================================
@router.post(
    "/registro",
    response_model=schemas.UsuarioResponse,  # Filtra la respuesta para no enviar la contraseña
    status_code=status.HTTP_201_CREATED,  # Código 201 Created al registrar exitosamente
    summary="Registrar Usuario",
)
def registrar_usuario(usuario: schemas.UsuarioCreate):
    conexion = (
        obtener_conexion()
    )  # Abre la conexión con SQLite
    cursor = conexion.cursor()  # Crea un cursor para ejecutar consultas SQL

    # Verifica si el correo ya existe en la base de datos
    cursor.execute("SELECT id FROM usuarios WHERE email = ?", (usuario.email,))
    if cursor.fetchone():
        conexion.close()  # Cierra la conexión si hay duplicado
        raise HTTPException(
            status_code=400, detail="El correo ya se encuentra registrado"
        )

    # Genera el hash encriptado de la contraseña usando bcrypt
    password_encriptada = obtener_password_hash(usuario.password)

    # Inserta el nuevo usuario asignándole el rol por defecto 'usuario'.
    # Se envuelve en try/except como segunda barrera: si dos personas se
    # registran casi al mismo tiempo con el mismo correo, la restricción
    # UNIQUE de la base de datos lo rechaza aunque el SELECT de arriba
    # no lo haya detectado a tiempo.
    try:
        cursor.execute(
            "INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?,"
            " 'usuario')",
            (usuario.nombre, usuario.email, password_encriptada),
        )
        conexion.commit()  # Guarda los cambios en la base de datos
    except sqlite3.IntegrityError:
        conexion.close()
        raise HTTPException(
            status_code=400, detail="El correo ya se encuentra registrado"
        )

    # Recupera los datos del usuario recién registrado usando el último ID asignado
    usuario_id = cursor.lastrowid
    cursor.execute(
        "SELECT id, nombre, email, rol FROM usuarios WHERE id = ?",
        (usuario_id,),
    )
    nuevo_usuario = cursor.fetchone()
    conexion.close()  # Libera la conexión de SQLite

    return dict(nuevo_usuario)  # Convierte la fila SQLite a diccionario


# ==============================================================================
# 2. INICIAR SESIÓN / LOGIN (Endpoint público)
# ==============================================================================
@router.post(
    "/login",
    response_model=schemas.TokenResponse,  # Responde con el token JWT en formato JSON
    summary="Iniciar Sesión (Login)",
)
def login(credenciales: schemas.UsuarioLogin):
    conexion = obtener_conexion()
    cursor = conexion.cursor()

    # Busca el usuario registrado por su correo electrónico
    cursor.execute(
        "SELECT * FROM usuarios WHERE email = ?", (credenciales.email,)
    )
    usuario = cursor.fetchone()
    conexion.close()

    # Valida que el usuario exista y que la contraseña enviada coincida con el hash de la BD
    if not usuario or not verificar_password(
        credenciales.password, usuario["password"]
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas",
        )

    # Firma el token JWT incluyendo el correo ('sub') y su rol dentro del payload
    token = crear_access_token(
        datos={"sub": usuario["email"], "rol": usuario["rol"]}
    )

    return {"access_token": token, "token_type": "bearer"}


# ==============================================================================
# 3. LISTAR USUARIOS (Protegido - Requiere ROL admin)
# ==============================================================================
@router.get(
    "/",
    response_model=list[
        schemas.UsuarioResponse
    ],  # Formatea la lista de respuestas
    summary="Listar Usuarios",
)
def listar_usuarios(
    admin: dict = Depends(verificar_admin),
):  # Dependencia: solo administradores
    conexion = obtener_conexion()
    cursor = conexion.cursor()

    # Selecciona la lista de usuarios excluyendo campos sensibles
    cursor.execute("SELECT id, nombre, email, rol FROM usuarios")
    usuarios = cursor.fetchall()
    conexion.close()

    return [
        dict(u) for u in usuarios
    ]  # Mapea todas las filas SQLite a lista de diccionarios


# ==============================================================================
# 4. OBTENER MI PERFIL (Protegido - Cualquier usuario autenticado)
# ==============================================================================
@router.get(
    "/me",
    response_model=schemas.UsuarioResponse,
    summary="Obtener Mi Perfil",
)
def obtener_mi_perfil(
    usuario_actual: dict = Depends(obtener_usuario_actual),
):  # Valida token JWT activo
    return usuario_actual  # Retorna el usuario inyectado desde la dependencia de seguridad


# ==============================================================================
# 5. ACTUALIZAR USUARIO (Protegido - Requiere ROL admin)
# ==============================================================================
@router.put(
    "/{usuario_id}",
    response_model=schemas.UsuarioResponse,
    summary="Actualizar Usuario",
)
def actualizar_usuario(
    usuario_id: int,  # ID capturado desde la URL
    datos: schemas.UsuarioCreate,  # Datos validados en el cuerpo de la petición
    admin: dict = Depends(verificar_admin),  # Exige permisos de administrador
):
    conexion = obtener_conexion()
    cursor = conexion.cursor()

    # Verifica si el usuario objetivo existe en la BD
    cursor.execute("SELECT id FROM usuarios WHERE id = ?", (usuario_id,))
    if not cursor.fetchone():
        conexion.close()
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Hashea la nueva contraseña antes de actualizar
    password_encriptada = obtener_password_hash(datos.password)

    # Actualiza nombre, correo y contraseña en el registro correspondiente
    cursor.execute(
        "UPDATE usuarios SET nombre = ?, email = ?, password = ? WHERE id = ?",
        (datos.nombre, datos.email, password_encriptada, usuario_id),
    )
    conexion.commit()

    # Consulta el registro actualizado para retornarlo
    cursor.execute(
        "SELECT id, nombre, email, rol FROM usuarios WHERE id = ?",
        (usuario_id,),
    )
    usuario_actualizado = cursor.fetchone()
    conexion.close()

    return dict(usuario_actualizado)


# ==============================================================================
# 6. ELIMINAR USUARIO (Protegido - Requiere ROL admin)
# ==============================================================================
@router.delete(
    "/{usuario_id}",
    status_code=status.HTTP_200_OK,
    summary="Eliminar Usuario",
)
def eliminar_usuario(
    usuario_id: int,
    admin: dict = Depends(verificar_admin),  # Exige permisos de administrador
):
    conexion = obtener_conexion()
    cursor = conexion.cursor()

    # Comprueba la existencia del usuario antes de proceder a borrarlo
    cursor.execute("SELECT id FROM usuarios WHERE id = ?", (usuario_id,))
    if not cursor.fetchone():
        conexion.close()
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Executa la sentencia DELETE sobre la tabla
    cursor.execute("DELETE FROM usuarios WHERE id = ?", (usuario_id,))
    conexion.commit()  # Guarda el borrado en la BD
    conexion.close()

    return {"mensaje": f"Usuario con ID {usuario_id} eliminado exitosamente"}