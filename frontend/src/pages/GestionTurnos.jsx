import "../styles/GestionTurnos.css";

function GestionTurnos() {
  const turnos = [
    {
      id: 1,
      usuario: "Miguel Loaiza",
      servicio: "Asesoría",
      fecha: "25/06/2026",
      estado: "Pendiente",
    },
    {
      id: 2,
      usuario: "Juan Pérez",
      servicio: "Soporte Técnico",
      fecha: "26/06/2026",
      estado: "Confirmado",
    },
    {
      id: 3,
      usuario: "Laura Gómez",
      servicio: "Atención General",
      fecha: "27/06/2026",
      estado: "Completado",
    },
  ];

  return (
    <div className="turnos-admin-container">

      <h1>Gestión de Turnos</h1>

      <div className="turnos-table">

        <table>

          <thead>
            <tr>
              <th>ID</th>
              <th>Usuario</th>
              <th>Servicio</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>

            {turnos.map((turno) => (
              <tr key={turno.id}>

                <td>{turno.id}</td>
                <td>{turno.usuario}</td>
                <td>{turno.servicio}</td>
                <td>{turno.fecha}</td>

                <td>
                  <span className={`estado ${turno.estado.toLowerCase()}`}>
                    {turno.estado}
                  </span>
                </td>

                <td>

                  <button className="btn-confirmar">
                    Confirmar
                  </button>

                  <button className="btn-cancelar">
                    Cancelar
                  </button>

                </td>

              </tr>
            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}

export default GestionTurnos;