import { useEffect, useState } from "react";
import { api } from "../lib/api";
import AdminSidebar from "../components/AdminSidebar";
import "../styles/GestionUsuarios.css";

function GestionUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [error, setError] = useState("");
  const cargar = () => api("/admin/usuarios").then(setUsuarios).catch((err) => setError(err.message));
  useEffect(cargar, []);
  async function eliminar(id) { if (!window.confirm("¿Eliminar este usuario y sus turnos?")) return; try { await api(`/admin/usuarios/${id}`, { method: "DELETE" }); cargar(); } catch (err) { setError(err.message); } }
  return <div className="admin-layout"><AdminSidebar /><main className="usuarios-container"><h1>Gestión de Usuarios</h1>{error && <p className="form-error">{error}</p>}<div className="usuarios-table"><table><thead><tr><th>ID</th><th>Nombre</th><th>Correo</th><th>Rol</th><th>Acciones</th></tr></thead><tbody>{usuarios.map((usuario) => <tr key={usuario.id}><td>{usuario.id}</td><td>{usuario.nombre}</td><td>{usuario.correo}</td><td>{usuario.rol}</td><td><button className="btn-eliminar" onClick={() => eliminar(usuario.id)}>Eliminar</button></td></tr>)}</tbody></table></div></main></div>;
}
export default GestionUsuarios;
