from typing import Optional  # Permite definir campos opcionales dentro de las clases
from pydantic import (
    BaseModel,
    EmailStr,
)  # Importa las clases base de Pydantic para la estructura de modelos y validación de correo



# Modelo utilizado para recibir y validar la entrada de datos al registrar una atención
class AtencionCreate(BaseModel):
    turno_id: int  # Identificador numérico del turno al que se asocia la atención (obligatorio)
    modulo: int  # Número del módulo de atención asignado (obligatorio)
    observacion: Optional[str] = (
        None  # Campo de texto opcional para notas sobre el proceso
    )


# Modelo utilizado para dar formato a la respuesta JSON de una atención
class AtencionResponse(BaseModel):
    id: int  # Identificador único autogenerado por SQLite
    turno_id: int  # Identificador del turno asociado
    modulo: int  # Número de módulo de atención
    fecha_atencion: str  # Fecha y hora en la que se registró la atención
    observacion: Optional[str] = None  # Notas opcionales de la atención

    model_config = {
        "from_attributes": True
    }  # Permite mapear directamente objetos/diccionarios de SQLite a Pydantic





# Modelo para recibir y validar los datos al crear o actualizar un turno
class TurnoCreate(BaseModel):
    numero: int  # Número del turno asignado en el sistema
    nombre_cliente: str  # Nombre completo del cliente que solicita el servicio
    estado: str = (
        "pendiente"  # Estado inicial por defecto en caso de no especificarse
    )


# Modelo para formatear la respuesta individual de un turno registrado
class TurnoResponse(BaseModel):
    id: int  # Identificador único en la base de datos
    numero: int  # Número de turno asignado
    nombre_cliente: str  # Nombre del cliente
    estado: str  # Estado actual (ej. pendiente, atendido, cancelado)
    fecha_creacion: str  # Fecha y hora de creación almacenada en BD

    model_config = {
        "from_attributes": True
    }  # Configuración para lectura desde el driver de BD


# Modelo relacional diseñado para responder la información de un turno con sus atenciones anidadas (JOIN)
class TurnoConAtencionesResponse(TurnoResponse):
    atenciones: list[AtencionResponse] = (
        []
    )  # Lista que contiene las atenciones asociadas al turno




# Modelo para validar los datos recibidos durante el registro de un nuevo usuario
class UsuarioCreate(BaseModel):
    nombre: str  # Nombre completo del usuario
    email: (
        EmailStr  # Valida automáticamente la sintaxis del correo (ej. usuario@dominio.com)
    )
    password: (
        str  # Contraseña recibida en texto plano antes de pasar por el hash
    )


# Modelo para validar los datos enviados en el cuerpo de la petición de inicio de sesión
class UsuarioLogin(BaseModel):
    email: EmailStr  # Correo electrónico registrado
    password: str  # Contraseña para verificar contra el hash


# Modelo para retornar la información de usuario excluyendo campos sensibles como la contraseña
class UsuarioResponse(BaseModel):
    id: int  # Identificador único del usuario
    nombre: str  # Nombre del usuario
    email: EmailStr  # Correo electrónico validado
    rol: str  # Rol del usuario en el sistema ('admin' o 'usuario')

    model_config = {
        "from_attributes": True
    }  # Mapeo de atributos provenientes de la BD


# Modelo estandarizado para la devolución del token de autenticación JWT
class TokenResponse(BaseModel):
    access_token: str  # Cadena codificada que contiene el token JWT
    token_type: str = (
        "bearer"  # Tipo de token requerido bajo la especificación OAuth2
    )