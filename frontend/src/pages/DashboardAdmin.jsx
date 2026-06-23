import { Link } from "react-router-dom";
import Footer from "../components/Footer";
import "../styles/DashboardAdmin.css";

function DashboardAdmin() {
  return (
    <>
      <div className="admin-layout">

        <aside className="sidebar">

          <h2>Administrador</h2>

          <ul>

            <li>
              <Link to="/admin">
                📊 Dashboard
              </Link>
            </li>

            <li>
              <Link to="/usuarios">
                👥 Usuarios
              </Link>
            </li>

            <li>
              <Link to="/gestion-turnos">
                🎫 Turnos
              </Link>
            </li>

            <li>
              <Link to="/">
                🏠 Inicio
              </Link>
            </li>

          </ul>

        </aside>

        <main className="dashboard-content">

          <h1>Panel Administrativo</h1>

          <div className="dashboard-cards">

            <div className="dashboard-card">
              <h2>200</h2>
              <p>Usuarios Registrados</p>
            </div>

            <div className="dashboard-card">
              <h2>500</h2>
              <p>Turnos Totales</p>
            </div>

            <div className="dashboard-card">
              <h2>35</h2>
              <p>Turnos Pendientes</p>
            </div>

            <div className="dashboard-card">
              <h2>465</h2>
              <p>Turnos Completados</p>
            </div>

          </div>

          <div className="recent-turnos">

            <h2>Últimos Turnos</h2>

            <table>

              <thead>
                <tr>
                  <th>ID</th>
                  <th>Usuario</th>
                  <th>Servicio</th>
                  <th>Estado</th>
                </tr>
              </thead>

              <tbody>

                <tr>
                  <td>001</td>
                  <td>Miguel</td>
                  <td>Asesoría</td>
                  <td>
                    <span className="estado pendiente">
                      Pendiente
                    </span>
                  </td>
                </tr>

                <tr>
                  <td>002</td>
                  <td>Juan</td>
                  <td>Soporte Técnico</td>
                  <td>
                    <span className="estado confirmado">
                      Confirmado
                    </span>
                  </td>
                </tr>

                <tr>
                  <td>003</td>
                  <td>Laura</td>
                  <td>Atención General</td>
                  <td>
                    <span className="estado completado">
                      Completado
                    </span>
                  </td>
                </tr>

              </tbody>

            </table>

          </div>

        </main>

      </div>

      <Footer />
    </>
  );
}

export default DashboardAdmin;