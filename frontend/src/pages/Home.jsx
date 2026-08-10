import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

import "../styles/Home.css";

function Home() {
  return (
    <>
      <Navbar />

      {/* HERO */}
      <section className="hero">
        <div className="hero-content">
          <h1>Sistema de Turnos Virtuales</h1>

          <p>
            Solicita, consulta y administra tus turnos de forma rápida,
            segura y desde cualquier dispositivo.
          </p>

          <div className="hero-buttons">
            <Link to="/login">
              <button className="btn-primary">
                Iniciar Sesión
              </button>
            </Link>

            <Link to="/registro">
              <button className="btn-secondary">
                Registrarse
              </button>
            </Link>

            <Link to="/solicitar-turno">
              <button className="btn-primary">
                Solicitar Turno
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* SERVICIOS */}
      <section className="services">
        <h2>Servicios Disponibles</h2>

        <div className="cards">
          <div className="card">
            <h3>Solicitud de Turnos</h3>
            <p>Reserva citas de forma rápida y segura.</p>
          </div>

          <div className="card">
            <h3>Consulta de Estado</h3>
            <p>Verifica el estado de tus turnos en tiempo real.</p>
          </div>

          <div className="card">
            <h3>Gestión Administrativa</h3>
            <p>Control total de los turnos del sistema.</p>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="steps">
        <h2>¿Cómo Funciona?</h2>

        <div className="steps-container">
          <div className="step">
            <h3>1</h3>
            <p>Regístrate en el sistema.</p>
          </div>

          <div className="step">
            <h3>2</h3>
            <p>Inicia sesión con tu cuenta.</p>
          </div>

          <div className="step">
            <h3>3</h3>
            <p>Solicita tu turno virtual.</p>
          </div>

          <div className="step">
            <h3>4</h3>
            <p>Consulta el estado de tus turnos.</p>
          </div>
        </div>
      </section>

      {/* ESTADISTICAS */}
      <section className="stats">
        <div className="stat">
          <h2>500+</h2>
          <p>Turnos Gestionados</p>
        </div>

        <div className="stat">
          <h2>200+</h2>
          <p>Usuarios Registrados</p>
        </div>

        <div className="stat">
          <h2>98%</h2>
          <p>Satisfacción</p>
        </div>
      </section>

      {/* BENEFICIOS */}
      <section className="beneficios">
        <h2>Beneficios del Sistema</h2>

        <div className="beneficios-grid">

          <div className="beneficio">
            <h3>⏱ Ahorro de Tiempo</h3>
            <p>
              Evita filas y gestiona tus turnos completamente en línea.
            </p>
          </div>

          <div className="beneficio">
            <h3>📱 Acceso Móvil</h3>
            <p>
              Utiliza el sistema desde celular, tablet o computador.
            </p>
          </div>

          <div className="beneficio">
            <h3>🔒 Seguridad</h3>
            <p>
              Información organizada y protegida para los usuarios.
            </p>
          </div>

        </div>
      </section>

      <Footer />
    </>
  );
}

export default Home;