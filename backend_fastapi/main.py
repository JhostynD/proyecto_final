from database import crear_tablas, sembrar_datos
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import atenciones, turnos, usuarios

app = FastAPI(
    title="API Sistema de Gestión de Turnos",
    description="API REST para gestionar turnos y atenciones",
    version="1.0.0",
)

# Configuración de CORS: se permite cualquier origen ("*") porque la API es
# de uso público (consulta de turnos). No se usan cookies de sesión, sino
# tokens Bearer en el header Authorization, por eso allow_credentials=False
# (además, los navegadores prohíben combinar "*" con credentials=True).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Crear las tablas e insertar datos iniciales (semilla) al iniciar la app
@app.on_event("startup")
def al_iniciar():
    crear_tablas()
    sembrar_datos() 


# Rutas de la API
app.include_router(turnos.router)
app.include_router(atenciones.router)
app.include_router(usuarios.router, prefix="/usuarios", tags=["Usuarios"])


@app.get("/", tags=["Inicio"])
def inicio():
    return {"mensaje": "API funcionando correctamente"}


# Endpoint de salud (Health Check)
@app.get("/health", tags=["Salud"])
def health_check():
    return {"estado": "ok"}