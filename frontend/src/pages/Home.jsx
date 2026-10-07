import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { obtenerSesion } from "../lib/auth";
import "../styles/Home.css";

function Home() {
  const [sesion, setSesion] = useState(obtenerSesion());

  useEffect(() => {
    const actualizar = () => setSesion(obtenerSesion());
    window.addEventListener("sesion-cerrada", actualizar);
    window.addEventListener("storage", actualizar);
    return () => {
      window.removeEventListener("sesion-cerrada", actualizar);
      window.removeEventListener("storage", actualizar);
    };
  }, []);

  return (
    <div className="page-shell">
      <Navbar />

      <main>
        {/* HERO */}
        <section className="hero-section">
          <div className="hero-container">
            <div className="hero-badge">
              <span className="badge-dot"></span>
              Atención y Gestión de Citas
            </div>

            <h1 className="hero-title">
              Gestiona tus turnos con <span className="text-gradient">fluidez y precisión</span>
            </h1>

            <p className="hero-description">
              Reserva tu cita en línea, consulta la disponibilidad de horarios en tiempo real
              y gestiona tus turnos sin filas presenciales.
            </p>

            <div className="hero-actions">
              <Link className="btn-apple-primary" to="/solicitar-turno">
                Solicitar Turno
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
              {sesion ? (
                <Link className="btn-apple-secondary" to="/consultar-turnos">
                  Ver mis turnos
                </Link>
              ) : (
                <Link className="btn-apple-secondary" to="/login">
                  Iniciar Sesión
                </Link>
              )}
            </div>

            {!sesion && (
              <p className="hero-register-hint">
                ¿No tienes una cuenta aún?{" "}
                <Link to="/registro" className="hero-register-link">
                  Crea una cuenta gratis
                </Link>
              </p>
            )}
          </div>
        </section>

        {/* CARACTERÍSTICAS REALES DEL SISTEMA */}
        <section className="stats-section">
          <div className="stats-container features-strip">
            <div className="stat-item">
              <div className="feature-item-title">Disponibilidad en Vivo</div>
              <div className="stat-label">Horarios validados al instante contra el sistema</div>
            </div>
            <div className="stat-divider" aria-hidden="true"></div>
            <div className="stat-item">
              <div className="feature-item-title">Gestión Inmediata</div>
              <div className="stat-label">Solicitud, confirmación y cancelación en línea</div>
            </div>
            <div className="stat-divider" aria-hidden="true"></div>
            <div className="stat-item">
              <div className="feature-item-title">Control Personal</div>
              <div className="stat-label">Monitoreo de estado desde tu panel en cualquier dispositivo</div>
            </div>
          </div>
        </section>

        {/* SERVICIOS */}
        <section className="section-block">
          <div className="section-header">
            <h2 className="section-title">Servicios Disponibles</h2>
            <p className="section-subtitle">Soluciones pensadas para hacer ágil cada etapa de tu proceso.</p>
          </div>

          <div className="services-grid">
            <div className="apple-card service-card">
              <div className="card-icon-box blue">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                  <line x1="16" x2="16" y1="2" y2="6" />
                  <line x1="8" x2="8" y1="2" y2="6" />
                  <line x1="3" x2="21" y1="10" y2="10" />
                  <path d="m9 16 2 2 4-4" />
                </svg>
              </div>
              <h3 className="card-title">Solicitud de Turnos</h3>
              <p className="card-description">Reserva citas para el servicio que requieras en fechas y horarios disponibles.</p>
            </div>

            <div className="apple-card service-card">
              <div className="card-icon-box green">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <h3 className="card-title">Consulta de Estado</h3>
              <p className="card-description">Monitorea si tu turno está pendiente, confirmado o completado en tiempo real.</p>
            </div>

            <div className="apple-card service-card">
              <div className="card-icon-box purple">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <h3 className="card-title">Gestión Administrativa</h3>
              <p className="card-description">Panel de control con métricas y actualización de turnos para operadores.</p>
            </div>
          </div>
        </section>

        {/* COMO FUNCIONA */}
        <section className="section-block bg-alternate">
          <div className="section-header">
            <h2 className="section-title">¿Cómo Funciona?</h2>
            <p className="section-subtitle">Cuatro pasos directos para acceder a tu atención.</p>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <span className="step-num">01</span>
              <h3 className="step-title">Regístrate</h3>
              <p className="step-desc">Crea tu cuenta segura en menos de un minuto.</p>
            </div>

            <div className="step-card">
              <span className="step-num">02</span>
              <h3 className="step-title">Inicia Sesión</h3>
              <p className="step-desc">Ingresa a tu cuenta con tus credenciales seguras.</p>
            </div>

            <div className="step-card">
              <span className="step-num">03</span>
              <h3 className="step-title">Pide tu Turno</h3>
              <p className="step-desc">Elige el servicio, fecha y horario disponible.</p>
            </div>

            <div className="step-card">
              <span className="step-num">04</span>
              <h3 className="step-title">Monitorea</h3>
              <p className="step-desc">Revisa el estado de tu turno desde tu panel personal.</p>
            </div>
          </div>
        </section>

        {/* BENEFICIOS */}
        <section className="section-block">
          <div className="section-header">
            <h2 className="section-title">Beneficios del Sistema</h2>
            <p className="section-subtitle">Diseñado para brindar comodidad, seguridad y rapidez.</p>
          </div>

          <div className="beneficios-grid">
            <div className="apple-card beneficio-card">
              <div className="beneficio-icon">⏱</div>
              <div>
                <h3 className="beneficio-title">Ahorro de Tiempo</h3>
                <p className="beneficio-desc">Evita filas presenciales gestionando tus citas completamente en línea.</p>
              </div>
            </div>

            <div className="apple-card beneficio-card">
              <div className="beneficio-icon">📱</div>
              <div>
                <h3 className="beneficio-title">Acceso Universal</h3>
                <p className="beneficio-desc">Diseño totalmente responsive optimizado para computador, tablet y celular.</p>
              </div>
            </div>

            <div className="apple-card beneficio-card">
              <div className="beneficio-icon">🔒</div>
              <div>
                <h3 className="beneficio-title">Privacidad y Seguridad</h3>
                <p className="beneficio-desc">Información protegida mediante autenticación y almacenamiento cifrado.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

export default Home;
