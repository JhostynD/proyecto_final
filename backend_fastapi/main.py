from database import crear_tablas, sembrar_datos
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import atenciones, turnos, usuarios

app = FastAPI(
    title="API Sistema de Gestión de Turnos",
    description="API REST para gestionar turnos y atenciones",
    version="1.0.0",
)

# Configuración Middleware de CORS
# Se permite cualquier origen ("*") para facilitar la integración pública en producción.
# Si fuera un entorno con mayor restricción, se especificarían las URLs del frontend autorizadas.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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