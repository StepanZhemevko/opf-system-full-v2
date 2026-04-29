import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerUser } from "../api/auth";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("test@example.com");
  const [username, setUsername] = useState("user_1");
  const [password, setPassword] = useState("testpass");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      await registerUser({ email, username, password });
      setMessage("Registration successful");
      navigate("/login");
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card auth-card">
      <div className="card-header">
        <h2>Register</h2>
        <p>Create a new account to save systems and optimization history.</p>
      </div>

      <form className="form-grid" onSubmit={onSubmit}>
        <label className="form-field">
          <span>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        </label>

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
          {loading ? "Registering..." : "Register"}
        </button>

        {message && <div className="status-box">{message}</div>}
      </form>
    </section>
  );
}