import Navbar from "../components/Navbar";
import "../styles/Registro.css";

function Registro() {
  return (
    <>
      <Navbar />

      <div className="registro-container">

        <div className="registro-card">

          <h2>Registro de Usuario</h2>

          <input
            type="text"
            placeholder="Nombre Completo"
          />

          <input
            type="email"
            placeholder="Correo Electrónico"
          />

          <input
            type="password"
            placeholder="Contraseña"
          />

          <button>Registrarme</button>

        </div>

      </div>
    </>
  );
}

export default Registro;