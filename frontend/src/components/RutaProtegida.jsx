import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { obtenerSesion, guardarSesion } from "../lib/auth";
import { api } from "../lib/api";

function calcularEstadoInicial(admin) {
  if (!admin) return "autorizado";
  const s = obtenerSesion();
  if (!s?.token) return "no_autenticado";
  if (s.usuario?.rol !== "admin") return "no_autorizado";
  return "verificando";
}

function RutaProtegida({ admin = false }) {
  const [sesion, setSesion] = useState(obtenerSesion);
  const [estadoAdmin, setEstadoAdmin] = useState(() => calcularEstadoInicial(admin));

  useEffect(() => {
    const actualizar = () => {
      const s = obtenerSesion();
      setSesion(s);
      setEstadoAdmin(calcularEstadoInicial(admin));
    };
    window.addEventListener("sesion-cerrada", actualizar);
    window.addEventListener("acceso-denegado", actualizar);
    return () => {
      window.removeEventListener("sesion-cerrada", actualizar);
      window.removeEventListener("acceso-denegado", actualizar);
    };
  }, [admin]);

  useEffect(() => {
    if (!admin || estadoAdmin !== "verificando") return;

    let cancelado = false;
    const sesionActual = obtenerSesion();

    api("/auth/perfil")
      .then((perfilReal) => {
        if (cancelado) return;
        if (perfilReal && perfilReal.rol === "admin") {
          guardarSesion({ ...sesionActual, usuario: perfilReal });
          setSesion({ ...sesionActual, usuario: perfilReal });
          setEstadoAdmin("autorizado");
        } else {
          if (sesionActual?.usuario) {
            sesionActual.usuario.rol = perfilReal?.rol || "usuario";
            guardarSesion(sesionActual);
          }
          setEstadoAdmin("no_autorizado");
        }
      })
      .catch(() => {
        if (cancelado) return;
        setEstadoAdmin("no_autorizado");
      });

    return () => {
      cancelado = true;
    };
  }, [admin, estadoAdmin]);

  if (!sesion?.token || estadoAdmin === "no_autenticado") {
    return <Navigate to="/login" replace />;
  }

  if (admin && estadoAdmin === "no_autorizado") {
    return <Navigate to="/dashboard" replace />;
  }

  if (admin && estadoAdmin === "verificando") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          backgroundColor: "var(--bg-canvas, #fbfbfd)",
        }}
        aria-busy="true"
        aria-live="polite"
      >
        <div style={{ textAlign: "center" }}>
          <span className="spinner-indicator large" />
          <p
            style={{
              marginTop: "16px",
              fontSize: "0.9rem",
              color: "var(--text-secondary, #59595e)",
              fontFamily: "var(--font-sans, -apple-system, BlinkMacSystemFont, sans-serif)",
            }}
          >
            Verificando permisos de acceso...
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

export default RutaProtegida;

