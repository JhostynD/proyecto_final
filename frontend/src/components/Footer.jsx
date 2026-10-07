import logoImg from "../assets/logo.png";
import "./Footer.css";

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-brand">
          <img src={logoImg} alt="FILA CERO" className="footer-logo-img" />
          <span className="footer-logo">FILA CERO</span>
          <span className="footer-badge">v1.0</span>
        </div>
        <p className="footer-copy">
          © {new Date().getFullYear()} FILA CERO. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}

export default Footer;