import { useState } from "react";
import { useApp } from "../store/appStore";
import { OFFICIAL_SERVER_URL } from "../lib/config";
import { Icon } from "./icons";

type Mode = "official" | "self-hosted" | "offline";

export function LoginPage({ showBack = false }: { showBack?: boolean }) {
  const loginAndConnect = useApp((s) => s.loginAndConnect);
  const registerAndConnect = useApp((s) => s.registerAndConnect);
  const startOffline = useApp((s) => s.startOffline);
  const connections = useApp((s) => s.connections);
  const switchConnection = useApp((s) => s.switchConnection);
  const goBack = useApp((s) => s.goBack);

  const [mode, setMode] = useState<Mode>("official");
  const [authAction, setAuthAction] = useState<"login" | "register">("login");

  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const isOfficial = mode === "official";
  const isSelfHosted = mode === "self-hosted";
  const isOffline = mode === "offline";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (isOffline) {
        await startOffline();
      } else if (isOfficial && authAction === "register") {
        const res = await registerAndConnect({
          username: username.trim(),
          email: email.trim(),
          password,
          deviceName: deviceName.trim() || "Mobile",
        });
        setNotice(res.message || "Account created. Check your email to verify, then sign in.");
        setAuthAction("login");
      } else {
        await loginAndConnect({
          serverUrl: isOfficial
            ? OFFICIAL_SERVER_URL
            : serverUrl.trim().replace(/\/+$/, ""),
          username: username.trim(),
          password,
          deviceName: deviceName.trim() || "Mobile",
          kind: isOfficial ? "official" : "self-hosted",
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  const submitLabel = loading
    ? "Please wait..."
    : isOffline
      ? "Start writing offline"
      : isOfficial && authAction === "register"
        ? "Create account"
        : "Sign in";

  return (
    <div className="page login-page">
      {showBack && (
        <header className="mobile-header">
          <button className="btn-icon" onClick={goBack} aria-label="Back">
            <Icon name="back" size={22} />
          </button>
          <h1 className="header-title">Add connection</h1>
          <div className="header-spacer" />
        </header>
      )}
      <div className="login-card">
        <h1 className="login-title">OmniLog</h1>
        <p className="login-subtitle">Choose how to connect</p>

        <div className="seg" role="tablist">
          <button
            type="button"
            className={`seg-btn ${isOfficial ? "active" : ""}`}
            onClick={() => { setMode("official"); setError(""); setNotice(""); }}
          >
            Official
          </button>
          <button
            type="button"
            className={`seg-btn ${isSelfHosted ? "active" : ""}`}
            onClick={() => { setMode("self-hosted"); setError(""); setNotice(""); }}
          >
            Self-hosted
          </button>
          <button
            type="button"
            className={`seg-btn ${isOffline ? "active" : ""}`}
            onClick={() => { setMode("offline"); setError(""); setNotice(""); }}
          >
            Offline
          </button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {isOffline ? (
            <p className="login-hint">
              Write and store entries entirely on this device. No account, no
              limits. Data stays local and is never uploaded.
            </p>
          ) : (
            <>
              {isOfficial && (
                <div className="seg seg-sm">
                  <button
                    type="button"
                    className={`seg-btn ${authAction === "login" ? "active" : ""}`}
                    onClick={() => { setAuthAction("login"); setError(""); }}
                  >
                    Log in
                  </button>
                  <button
                    type="button"
                    className={`seg-btn ${authAction === "register" ? "active" : ""}`}
                    onClick={() => { setAuthAction("register"); setError(""); }}
                  >
                    Sign up
                  </button>
                </div>
              )}

              {isSelfHosted && (
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
              )}

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

              {isOfficial && authAction === "register" && (
                <label className="field">
                  <span className="field-label">Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </label>
              )}

              <label className="field">
                <span className="field-label">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={authAction === "register" ? "new-password" : "current-password"}
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
            </>
          )}

          {notice && <div className="notice-msg">{notice}</div>}
          {error && <div className="error-msg">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {submitLabel}
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
                {c.kind === "offline" ? " (offline)" : ""}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
