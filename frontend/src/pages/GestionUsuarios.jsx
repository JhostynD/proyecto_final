import "../styles/GestionUsuarios.css";

function GestionUsuarios() {
  const usuarios = [
    {
      id: 1,
      nombre: "Miguel Loaiza",
      correo: "miguel@gmail.com",
      rol: "Usuario",
    },
    {
      id: 2,
      nombre: "Juan Pérez",
      correo: "juan@gmail.com",
      rol: "Administrador",
    },
    {
      id: 3,
      nombre: "Laura Gómez",
      correo: "laura@gmail.com",
      rol: "Usuario",
    },
  ];

  return (
    <div className="usuarios-container">

      <h1>Gestión de Usuarios</h1>

      <div className="usuarios-table">

        <table>

          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>

            {usuarios.map((usuario) => (
              <tr key={usuario.id}>
                <td>{usuario.id}</td>
                <td>{usuario.nombre}</td>
                <td>{usuario.correo}</td>
                <td>{usuario.rol}</td>

                <td>

                  <button className="btn-editar">
                    Editar
                  </button>

                  <button className="btn-eliminar">
                    Eliminar
                  </button>

                </td>
              </tr>
            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}

export default GestionUsuarios;