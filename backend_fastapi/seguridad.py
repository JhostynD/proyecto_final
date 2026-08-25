from datetime import datetime, timedelta, timezone  # Para manejar tiempos de expiración del Token
from database import obtener_conexion  # Para validar usuarios contra la BD de SQLite[cite: 1]
from fastapi import Depends, HTTPException, status  # Utilidades de FastAPI para dependencias y errores
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer  # Para manejar Tokens Bearer en los Headers
import jwt  # Librería para firmar y decodificar Tokens JWT
from passlib.context import CryptContext  # Librería para encriptar/verificar contraseñas con bcrypt[cite: 1]


# --- CONFIGURACIÓN DE SEGURIDAD Y JWT ---
SECRET_KEY = "clave_secreta_super_segura_ga6"  # Clave privada para firmar los Tokens JWT (cambiar en producción)
ALGORITHM = "HS256"  # Algoritmo de encriptación simétrica para JWT
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # Tiempo de validez del Token en minutos

# Instancia de Passlib configurada para usar el esquema de encriptación bcrypt[cite: 1]
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Esquema de seguridad Bearer que buscará el encabezado 'Authorization: Bearer <token>'
security_bearer = HTTPBearer()


# --- FUNCIONES DE HASHING Y CONTRASEÑAS ---
def obtener_password_hash(password: str) -> str:
    # Recibe la clave en texto plano y retorna su hash encriptado con bcrypt[cite: 1]
    return pwd_context.hash(password)


def verificar_password(password_plana: str, password_encriptada: str) -> bool:
    # Compara una clave en texto plano contra el hash de la BD y retorna True si coinciden[cite: 1]
    return pwd_context.verify(password_plana, password_encriptada)


# --- FUNCIÓN PARA CREAR TOKENS JWT ---
def crear_access_token(datos: dict) -> str:
    datos_a_codificar = datos.copy()  # Copia el diccionario original (email, rol, etc.)
    expiracion = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )  # Calcula la fecha/hora de expiración
    datos_a_codificar.update(
        {"exp": expiracion}
    )  # Añade la clave 'exp' exigida por el estándar JWT
    # Firma y codifica el Token pasando la clave secreta y el algoritmo
    token_jwt = jwt.encode(datos_a_codificar, SECRET_KEY, algorithm=ALGORITHM)
    return token_jwt  # Devuelve la cadena de texto del Token generado[cite: 1]


# --- DEPENDENCIA: OBTENER USUARIO ACTUAL DESDE EL TOKEN JWT ---
def obtener_usuario_actual(
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    token = credentials.credentials  # Extrae el texto del Token JWT desde el Header Authorization
    excepcion_autenticacion = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido o expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # Decodifica el token usando la misma clave secreta y algoritmo
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")  # Extrae el correo del usuario del campo 'sub'
        if email is None:
            raise excepcion_autenticacion  # Lanza 401 si el token no contiene el correo
    except jwt.PyJWTError:
        raise excepcion_autenticacion  # Lanza 401 si el token expiró o fue alterado

    # Consulta en la BD SQLite si el usuario existe activamente
    conexion = obtener_conexion()
    cursor = conexion.cursor()
    cursor.execute(
        "SELECT id, nombre, email, rol FROM usuarios WHERE email = ?", (email,)
    )
    usuario = cursor.fetchone()
    conexion.close()

    if usuario is None:
        raise excepcion_autenticacion  # Lanza 401 si el usuario ya no existe en la BD

    return dict(usuario)  # Retorna el diccionario con la información del usuario autenticado


# --- DEPENDENCIA: VERIFICAR ROL DE ADMINISTRADOR (RBAC) ---
def verificar_admin(usuario_actual: dict = Depends(obtener_usuario_actual)):
    # Toma el usuario obtenido desde 'obtener_usuario_actual' y valida su rol
    if usuario_actual.get("rol") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permisos insuficientes: Requiere ROL admin",
        )  # Lanza error 403 Forbidden si no es administrador[cite: 1]

    return usuario_actual  # Retorna el usuario si supera la verificación de rol