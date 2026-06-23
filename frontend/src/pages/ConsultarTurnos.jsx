import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import "../styles/ConsultarTurnos.css";

function ConsultarTurnos() {
  const turnos = [
    {
      id: "001",
      servicio: "Asesoría",
      fecha: "20/06/2026",
      hora: "08:00 AM",
      estado: "Pendiente"
    },
    {
      id: "002",
      servicio: "Soporte Técnico",
      fecha: "22/06/2026",
      hora: "10:30 AM",
      estado: "Confirmado"
    },
    {
      id: "003",
      servicio: "Atención General",
      fecha: "24/06/2026",
      hora: "02:00 PM",
      estado: "Cancelado"
    }
  ];

  return (
    <>
      <Navbar />

      <div className="consulta-container">

        <h1>Mis Turnos</h1>

        <div className="table-container">

          <table>

            <thead>
              <tr>
                <th>ID</th>
                <th>Servicio</th>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Estado</th>
              </tr>
            </thead>

            <tbody>

              {turnos.map((turno) => (
                <tr key={turno.id}>
                  <td>{turno.id}</td>
                  <td>{turno.servicio}</td>
                  <td>{turno.fecha}</td>
                  <td>{turno.hora}</td>
                  <td>
                    <span
                      className={`estado ${turno.estado.toLowerCase()}`}
                    >
                      {turno.estado}
                    </span>
                  </td>
                </tr>
              ))}

            </tbody>

          </table>

        </div>

      </div>

      <Footer />
    </>
  );
}

export default ConsultarTurnos;