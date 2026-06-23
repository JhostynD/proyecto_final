import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Registro from "./pages/Registro";
import SolicitarTurno from "./pages/SolicitarTurno";
import ConsultarTurnos from "./pages/ConsultarTurnos";
import DashboardAdmin from "./pages/DashboardAdmin";
import DashboardUsuario from "./pages/DashboardUsuario";
import GestionUsuarios from "./pages/GestionUsuarios";
import GestionTurnos from "./pages/GestionTurnos";
import NotFound from "./pages/NotFound";



function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />

        <Route path="/login" element={<Login />} />

        <Route path="/registro" element={<Registro />} />

        <Route path="/solicitar-turno" element={<SolicitarTurno />} />
        <Route path="/admin" element={<DashboardAdmin />} />

        <Route path="/consultar-turnos" element={<ConsultarTurnos />} />

        <Route path="/dashboard" element={<DashboardUsuario />} />

        <Route path="/usuarios" element={<GestionUsuarios />} />

        <Route path="/gestion-turnos" element={<GestionTurnos />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
