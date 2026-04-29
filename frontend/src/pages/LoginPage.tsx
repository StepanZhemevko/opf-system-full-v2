import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMe, loginUser } from "../api/auth";
import { saveToken } from "../lib/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("testuser");
  const [password, setPassword] = useState("testpass");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const token = await loginUser({ username, password });
      saveToken(token.access_token);
      await getMe();
      setMessage("Login successful");
      navigate("/systems");
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card auth-card">
      <div className="card-header">
        <h2>Login</h2>
        <p>Use your account to access systems, optimization, and history.</p>
      </div>

      <form className="form-grid" onSubmit={onSubmit}>
        <label className="form-field">
          <span>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
        </label>

        <label className="form-field">
          <span>Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
          />
        </label>

        <button className="button" type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>

        {message && <div className="status-box">{message}</div>}
      </form>
    </section>
  );
}