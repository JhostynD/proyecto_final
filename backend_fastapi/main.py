from database import crear_tablas, sembrar_datos
from fastapi import FastAPI
from routers import atenciones, turnos, usuarios

app = FastAPI(
    title="API Sistema de Gestión de Turnos",
    description="API REST para gestionar turnos y atenciones",
    version="1.0.0",
)


# Crear las tablas e insertar datos iniciales (semilla) al iniciar la app
@app.on_event("startup")
def al_iniciar():
    crear_tablas()
    sembrar_datos() 


# Conectar los routers con sus prefijos y etiquetas para Swagger
app.include_router(turnos.router, prefix="/turnos", tags=["Turnos"])
app.include_router(atenciones.router, prefix="/atenciones", tags=["Atenciones"])
app.include_router(usuarios.router, prefix="/usuarios", tags=["Usuarios"])


@app.get("/", tags=["Inicio"])
def inicio():
    return {"mensaje": "API funcionando correctamente"}