# FILA CERO – Sistema de Turnos Virtuales

FILA CERO es una aplicación web para solicitar y gestionar turnos inmediatos y citas programadas. Permite que las personas pidan su turno desde un navegador web y conozcan el estado de su espera. Al mismo tiempo, le da al personal de atención una herramienta sencilla para llamar a los usuarios y atenderlos de forma ordenada.

---

## Problema que resuelve

En muchos puntos de atención presencial, los turnos se siguen manejando con papel, fichas o cuadernos físicos. Esta forma de trabajo impide saber qué asesor o módulo atendió a cada persona y no permite conservar un registro u observaciones de cada atención.

FILA CERO centraliza toda esta información en un solo sistema digital. Así, tanto los usuarios como la entidad tienen claridad sobre la fila y los tiempos de atención.

---

## Qué hace la aplicación

* **Gestión para clientes:**
  * Solicitar un turno inmediato o agendar una cita previa.
  * Consultar sus turnos activos, cuántas personas van por delante y el tiempo estimado de espera.
  * Cancelar turnos o citas cuando ya no los necesiten.
* **Control de disponibilidad:**
  * Permite revisar los horarios disponibles por fecha.
  * Los días festivos oficiales de Colombia (según la Ley 51 de 1983) se descuentan de forma automática para evitar agendamientos en días no laborales.
* **Gestión para el personal (administración):**
  * Llamar turnos asignándolos a un módulo de atención específico.
  * Registrar el inicio y el fin de cada atención.
  * Consultar un resumen operativo con las cifras del día (turnos en espera, atendidos y cancelados).
* **Estados por los que pasa cada turno:**
  * `Pendiente`: registrado por el usuario.
  * `Confirmado`: cita aprobada en el horario seleccionado.
  * `En espera`: el usuario está esperando ser llamado.
  * `Llamando`: se le indica al usuario a qué módulo debe acercarse.
  * `En atención`: el asesor está atendiendo al usuario.
  * `Completado`: la atención finalizó con éxito.
  * `Cancelado`: el turno fue anulado por el usuario o el personal.
  * `No presentado`: el usuario fue llamado pero no se presentó al módulo.
* **Servicios de ejemplo:**
  * Asesoría de Crédito
  * Asesoría Financiera
  * Soporte Técnico
  * Atención General
  * Atención Especializada
  *(Nota: estos servicios forman parte de un caso de estudio de una entidad financiera simulada. No existe una organización real asociada al proyecto).*
* **Roles de usuario:**
  * **Usuario:** cuenta de cliente; puede solicitar y consultar sus propios turnos.
  * **Administrador:** personal de atención; gestiona la fila de turnos, llama a los módulos y administra las cuentas de usuario.

---

## Tecnologías utilizadas

* **React:** la parte visual e interactiva que el usuario ve y usa en su navegador.
* **Node.js con Express:** el servidor que recibe y procesa todas las solicitudes del sistema.
* **MySQL:** la base de datos donde se almacena la información de usuarios, servicios y turnos.

---

## Cómo ponerlo en marcha

### Requisitos previos
* Tener instalado Node.js en el equipo.
* Tener instalado un servidor de MySQL (como MySQL Server, XAMPP o similar).

### Pasos de instalación

1. **Clonar o descargar el proyecto:**
   ```bash
   git clone https://github.com/JhostynD/proyecto_final.git
   cd proyecto_final
   ```

2. **Instalar dependencias:**
   Ejecuta los siguientes comandos para instalar los paquetes necesarios:
   ```bash
   npm install
   cd backend && npm install && cd ..
   cd frontend && npm install && cd ..
   ```

3. **Configurar la base de datos:**
   * Abre tu administrador de MySQL e importa el archivo `backend/database.sql`.
   * Esto creará la base de datos `turnos_db` con sus tablas y los servicios iniciales.

4. **Configurar las variables de entorno:**
   * En la carpeta `backend`, crea una copia de `.env.example` y nómbrala `.env`.
   * Ajusta los datos de conexión a tu MySQL (`DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`) y define una clave para `JWT_SECRET`.

5. **Iniciar la aplicación:**
   Desde la carpeta principal del proyecto, ejecuta:
   ```bash
   npm run dev
   ```
   * El servidor (backend) iniciará en `http://localhost:3000`.
   * La interfaz web (frontend) abrirá en `http://localhost:5173`.

> **Nota para crear el primer administrador:**
> Regístrate normalmente desde la aplicación web como usuario. Luego, en tu base de datos MySQL, ejecuta:
> ```sql
> UPDATE usuarios SET rol = 'admin' WHERE correo = 'tu-correo@ejemplo.com';
> ```
> Vuelve a iniciar sesión para ingresar con permisos de administrador.

---

## Estado del proyecto y limitaciones

* **Proyecto académico:** se trata de un prototipo formativo de software.
* **Medición del problema:** la magnitud exacta del problema en un entorno real está **pendiente de verificar** mediante trabajo de campo.
* **Marco normativo:** la Ley 1581 de 2012 (protección de datos personales) y la Ley 1328 de 2009 (protección al consumidor financiero) se consideran como marco de referencia legal, pero el prototipo actual aún no implementa mecanismos técnicos específicos derivados de estas leyes.

---

## Autores y contexto académico

* **Programa:** Tecnología en Análisis y Desarrollo de Software (ADSO).
* **Ficha:** 3169892.
* **Centro:** SENA CTMA – Regional Antioquia.
* **Equipo de aprendices:** [NOMBRES].