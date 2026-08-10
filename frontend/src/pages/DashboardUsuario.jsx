import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import "../styles/DashboardUsuario.css";

function DashboardUsuario() {
  return (
    <>
      <Navbar />

      <div className="usuario-container">

        <h1>Bienvenido, Miguel</h1>

        <div className="usuario-cards">

          <div className="usuario-card">
            <h2>5</h2>
            <p>Turnos Solicitados</p>
          </div>

          <div className="usuario-card">
            <h2>2</h2>
            <p>Turnos Pendientes</p>
          </div>

          <div className="usuario-card">
            <h2>1</h2>
            <p>Próximo Turno</p>
          </div>

        </div>

        <div className="proximo-turno">

          <h2>Próximo Turno</h2>

          <div className="turno-info">
            <p><strong>Servicio:</strong> Asesoría</p>
            <p><strong>Fecha:</strong> 25/06/2026</p>
            <p><strong>Hora:</strong> 10:00 AM</p>
            <p><strong>Estado:</strong> Confirmado</p>
          </div>

        </div>

      </div>

      <Footer />
    </>
  );
}

export default DashboardUsuario;