import Navbar from "../components/Navbar";
import "../styles/Login.css";

function Login() {
  return (
    <>
      <Navbar />

      <div className="login-container">

        <div className="login-card">

          <h2>Iniciar Sesión</h2>

          <input
            type="email"
            placeholder="Correo electrónico"
          />

          <input
            type="password"
            placeholder="Contraseña"
          />

          <button>Ingresar</button>

        </div>

      </div>
    </>
  );
}

export default Login;