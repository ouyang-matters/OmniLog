import { useState } from "react";
import { useApp } from "../store/appStore";

export function LoginPage() {
  const loginAndConnect = useApp((s) => s.loginAndConnect);
  const connections = useApp((s) => s.connections);
  const switchConnection = useApp((s) => s.switchConnection);

  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await loginAndConnect({
        serverUrl: serverUrl.trim().replace(/\/+$/, ""),
        username: username.trim(),
        password,
        deviceName: deviceName.trim() || "Mobile",
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page login-page">
      <div className="login-card">
        <h1 className="login-title">OmniLog</h1>
        <p className="login-subtitle">Sign in to your server</p>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="field">
            <span className="field-label">Server URL</span>
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://your-server.com"
              required
              autoFocus
            />
          </label>
          <label className="field">
            <span className="field-label">Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              autoComplete="username"
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          <label className="field">
            <span className="field-label">Device name (optional)</span>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="Mobile"
            />
          </label>
          {error && <div className="error-msg">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Connecting..." : "Sign in"}
          </button>
        </form>

        {connections.length > 0 && (
          <div className="saved-connections">
            <p className="saved-label">Saved connections</p>
            {connections.map((c) => (
              <button
                key={c.id}
                className="btn btn-outline connection-item"
                onClick={() => switchConnection(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
