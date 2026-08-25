# database.py
import sqlite3

DATABASE = "database.db"


def obtener_conexion():
    connection = sqlite3.connect(DATABASE, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def crear_tablas():
    connection = obtener_conexion()
    cursor = connection.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            rol TEXT NOT NULL DEFAULT 'usuario'
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS turnos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero INTEGER NOT NULL,
            nombre_cliente TEXT NOT NULL,
            estado TEXT NOT NULL DEFAULT 'pendiente',
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS atenciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            turno_id INTEGER NOT NULL,
            modulo INTEGER NOT NULL,
            fecha_atencion DATETIME DEFAULT CURRENT_TIMESTAMP,
            observacion TEXT,
            FOREIGN KEY (turno_id) REFERENCES turnos(id)
        )
    """)

    connection.commit()
    connection.close()


def sembrar_datos():
    # IMPORTACIÓN LOCAL AQUÍ PARA EVITAR EL BUCLE
    from seguridad import obtener_password_hash

    connection = obtener_conexion()
    cursor = connection.cursor()

    cursor.execute("SELECT COUNT(*) FROM usuarios")
    if cursor.fetchone()[0] == 0:
        pass_hash = obtener_password_hash("admin123")
        cursor.execute(
            "INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?,"
            " ?, ?)",
            ("Administrador", "admin@correo.com", pass_hash, "admin"),
        )

        user_hash = obtener_password_hash("user123")
        cursor.execute(
            "INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?,"
            " ?, ?)",
            ("Usuario Normal", "user@correo.com", user_hash, "usuario"),
        )

    cursor.execute("SELECT COUNT(*) FROM turnos")
    if cursor.fetchone()[0] == 0:
        cursor.execute(
            "INSERT INTO turnos (numero, nombre_cliente, estado) VALUES (?, ?,"
            " ?)",
            (101, "Carlos Gómez", "atendido"),
        )
        cursor.execute(
            "INSERT INTO turnos (numero, nombre_cliente, estado) VALUES (?, ?,"
            " ?)",
            (102, "Ana Martínez", "pendiente"),
        )

    connection.commit()
    connection.close()