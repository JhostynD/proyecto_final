1. Endpoint de restablecimiento del limitador sin protección

Archivo: backend/src/server.js, cerca de la línea 380.

POST /api/auth/reset-limits llama a resetearLimitador() sin autenticar al solicitante. Cualquier cliente que pueda alcanzar la API puede borrar los contadores de intentos fallidos y debilitar el mecanismo de protección del inicio de sesión.

Corrección: eliminar el endpoint de producción y ofrecer un mecanismo de reinicio exclusivo para pruebas, sin acceso público.



2. La suite de pruebas puede borrar o modificar datos reales

Archivo: backend/test_suite_20.cjs.

Encontré operaciones que:
- Eliminan turnos de fechas completas, no solo de usuarios de prueba.
- Marcan como completados turnos de usuarios reales.
- Cambian el estado de los turnos virtuales activos del servicio 2.
Esto puede alterar datos legítimos si ejecutas las pruebas sobre tu base de datos habitual.

Corrección: ejecutar la suite contra una base de datos de pruebas independiente, con datos identificados y limpieza limitada exclusivamente a esos datos.




3. La disponibilidad puede mostrar horas fuera de la jornada

Archivo: backend/src/server.js, función calcularDisponibilidadSlots.

El generador permite que una cita comience a las 16:30 porque su condición solo comprueba que la hora de inicio no supere el cierre. Sin embargo, una cita de 30 minutos iniciada a las 16:30 terminaría a las 17:00.

El endpoint de creación sí rechaza una cita que termine después de las 16:30. Por tanto, la interfaz puede ofrecer un horario que después la API rechaza.

Corrección: generar únicamente horarios que cumplan horaInicio + duración <= cierre, manteniendo la validación del backend como autoridad.




4. Los permisos de administrador pueden quedar desactualizados

Archivo: backend/src/auth.js.

El rol se guarda dentro del JWT durante ocho horas y el middleware soloAdmin confía en ese rol. Si se degrada a un administrador a usuario normal, su token vigente puede seguir autorizándolo como administrador hasta que expire.

Corrección: definir una estrategia de revocación o verificación de permisos que permita aplicar cambios de rol sin depender exclusivamente de la expiración del token.



5. Varias pruebas no verifican lo que dicen verificar

Archivo: backend/test_suite_20.cjs.

Encontré tres casos especialmente problemáticos:
- Caso 14: afirma que se rechaza un segundo turno virtual, pero únicamente inserta uno y comprueba que existe al menos uno. No intenta crear el segundo.
- Caso 16: comprueba si hay códigos duplicados en la base de datos, pero no genera solicitudes concurrentes para demostrar que la generación sea segura bajo concurrencia.
- Caso 20: afirma comprobar la recuperación tras expirar el límite de intentos, pero restablece manualmente los contadores. No espera a que expire la ventana.
Corrección: reescribir los casos para que reproduzcan realmente cada escenario y verifiquen la respuesta HTTP y el estado final de la base de datos.
