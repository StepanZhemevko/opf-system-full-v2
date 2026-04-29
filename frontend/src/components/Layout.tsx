import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearToken, isAuthenticated } from "../lib/auth";

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const authenticated = isAuthenticated();

  const onLogout = () => {
    clearToken();
    navigate("/login");
  };

  const linkClass = (path: string) =>
    location.pathname === path ? "nav-link nav-link-active" : "nav-link";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1 className="brand-title">OPF Web System</h1>
          <p className="brand-subtitle">
            Optimal Power Flow platform for upload, validation, optimization, and history
          </p>
        </div>

        {authenticated && (
          <button className="button button-secondary" onClick={onLogout} type="button">
            Logout
          </button>
        )}
      </header>

      <nav className="nav">
        {!authenticated && (
          <>
            <Link className={linkClass("/login")} to="/login">
              Login
            </Link>
            <Link className={linkClass("/register")} to="/register">
              Register
            </Link>
          </>
        )}

        {authenticated && (
          <>
            <Link className={linkClass("/systems")} to="/systems">
              Systems
            </Link>
            <Link className={linkClass("/history")} to="/history">
              History
            </Link>
          </>
        )}
      </nav>

      <main className="page-content">
        <Outlet />
      </main>
    </div>
  );
}
