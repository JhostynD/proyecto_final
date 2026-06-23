import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import "../styles/SolicitarTurno.css";

function SolicitarTurno() {
  return (
    <>
      <Navbar />

      <div className="turno-container">

        <div className="turno-card">

          <h2>Solicitar Turno</h2>

          <form>

            <input
              type="text"
              placeholder="Nombre Completo"
            />

            <input
              type="email"
              placeholder="Correo Electrónico"
            />

            <select>
              <option>Seleccione un servicio</option>
              <option>Asesoría</option>
              <option>Soporte Técnico</option>
              <option>Atención General</option>
            </select>

            <input type="date" />

            <input type="time" />

            <button type="submit">
              Solicitar Turno
            </button>

          </form>

        </div>

      </div>

      <Footer />
    </>
  );
}

export default SolicitarTurno;