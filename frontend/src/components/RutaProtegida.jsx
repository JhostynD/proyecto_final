import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { obtenerSesion } from "../lib/auth";

function RutaProtegida({ admin = false }) {
  const [sesion, setSesion] = useState(obtenerSesion);
  useEffect(() => {
    const actualizar = () => setSesion(obtenerSesion());
    window.addEventListener("sesion-cerrada", actualizar);
    return () => window.removeEventListener("sesion-cerrada", actualizar);
  }, []);
  if (!sesion?.token) return <Navigate to="/login" replace />;
  if (admin && sesion.usuario?.rol !== "admin") return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export default RutaProtegida;
