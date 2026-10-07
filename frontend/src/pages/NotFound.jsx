import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

function NotFound() {
  return (
    <div className="page-shell">
      <Navbar />
      <main style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 24px",
        textAlign: "center"
      }}>
        <div style={{
          maxWidth: "480px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-xl)",
          padding: "48px 32px",
          boxShadow: "var(--shadow-md)"
        }}>
          <div style={{
            fontSize: "4rem",
            fontWeight: "800",
            letterSpacing: "-0.04em",
            color: "var(--accent)",
            lineHeight: 1,
            marginBottom: "16px"
          }}>
            404
          </div>
          <h1 style={{
            fontSize: "1.6rem",
            fontWeight: "700",
            letterSpacing: "-0.02em",
            textWrap: "balance",
            marginBottom: "12px"
          }}>
            Página no encontrada
          </h1>
          <p style={{
            color: "var(--text-secondary)",
            fontSize: "0.96rem",
            marginBottom: "28px",
            lineHeight: 1.5
          }}>
            La ruta a la que intentas acceder no existe o fue movida a otra ubicación.
          </p>
          <Link
            to="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "var(--accent)",
              color: "white",
              padding: "12px 24px",
              borderRadius: "var(--radius-pill)",
              fontWeight: 600,
              fontSize: "0.92rem",
              textDecoration: "none",
              boxShadow: "var(--btn-primary-shadow)"
            }}
          >
            Volver al inicio
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default NotFound;