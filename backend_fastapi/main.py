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


# turnos.py y atenciones.py ya definen su propio prefix dentro del APIRouter,
# por eso aquí NO se repite (evita rutas duplicadas como /turnos/turnos)
app.include_router(turnos.router)
app.include_router(atenciones.router)
app.include_router(usuarios.router, prefix="/usuarios", tags=["Usuarios"])


@app.get("/", tags=["Inicio"])
def inicio():
    return {"mensaje": "API funcionando correctamente"}