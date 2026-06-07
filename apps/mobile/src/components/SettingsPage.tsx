import { useState } from "react";
import { useApp } from "../store/appStore";

export function SettingsPage() {
  const me = useApp((s) => s.me);
  const theme = useApp((s) => s.theme);
  const online = useApp((s) => s.online);
  const config = useApp((s) => s.config);
  const connections = useApp((s) => s.connections);
  const activeConnectionId = useApp((s) => s.activeConnectionId);
  const messages = useApp((s) => s.messages);
  const toggleTheme = useApp((s) => s.toggleTheme);
  const signOut = useApp((s) => s.signOut);
  const goBack = useApp((s) => s.goBack);
  const changePassword = useApp((s) => s.changePassword);
  const markAllMessagesRead = useApp((s) => s.markAllMessagesRead);
  const switchConnection = useApp((s) => s.switchConnection);
  const removeConnection = useApp((s) => s.removeConnection);
  const navigate = useApp((s) => s.navigate);

  const active = connections.find((c) => c.id === activeConnectionId) ?? null;

  const [pwSection, setPwSection] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  const unread = messages.filter((m) => !m.readAt);

  const kindLabel: Record<string, string> = {
    official: "Official server",
    "self-hosted": "Self-hosted server",
    "local-embedded": "Local server",
    offline: "Offline (this device)",
  };

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg("");
    try {
      await changePassword(oldPw, newPw);
      setPwMsg("Password changed");
      setOldPw("");
      setNewPw("");
    } catch (err: unknown) {
      setPwMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="page settings-page">
      <header className="mobile-header">
        <button className="btn-icon" onClick={goBack} aria-label="Back">
          &larr;
        </button>
        <h1 className="header-title">Settings</h1>
        <div className="header-spacer" />
      </header>

      <div className="settings-content">
        <section className="settings-section">
          <h2>Account</h2>
          {me && (
            <div className="account-info">
              {me.avatarDataUrl && <img className="avatar" src={me.avatarDataUrl} alt="" />}
              <div>
                <div className="account-name">{me.displayName || me.username}</div>
                <div className="account-role">{me.role}</div>
              </div>
            </div>
          )}
          <div className="setting-row">
            <span>Status</span>
            <span className={online ? "status-online" : "status-offline"}>
              {online ? "Connected" : "Offline"}
            </span>
          </div>
          {config && (
            <div className="setting-row">
              <span>Server</span>
              <span className="setting-value">{config.serverUrl}</span>
            </div>
          )}
        </section>

        {unread.length > 0 && (
          <section className="settings-section">
            <div className="section-header">
              <h2>Messages ({unread.length})</h2>
              <button className="btn-text" onClick={markAllMessagesRead}>
                Mark all read
              </button>
            </div>
            <ul className="message-list">
              {unread.slice(0, 5).map((m) => (
                <li key={m._id} className="message-item">
                  <div className="message-title">{m.title}</div>
                  <div className="message-body">{m.body}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="settings-section">
          <h2>Appearance</h2>
          <div className="setting-row" onClick={toggleTheme}>
            <span>Theme</span>
            <span className="setting-value">{theme === "dark" ? "Dark" : "Light"}</span>
          </div>
        </section>

        <section className="settings-section">
          <h2>Mode &amp; connections</h2>
          <div className="setting-row">
            <span>Current mode</span>
            <span className="setting-value">
              {active ? kindLabel[active.kind] ?? active.kind : "—"}
            </span>
          </div>
          {connections.map((c) => (
            <div
              key={c.id}
              className={`setting-row connection-row ${c.id === activeConnectionId ? "active" : ""}`}
            >
              <button className="btn-text" onClick={() => switchConnection(c.id)}>
                {c.id === activeConnectionId ? "● " : ""}
                {c.name}
              </button>
              {c.id !== activeConnectionId && (
                <button
                  className="btn-text danger"
                  onClick={() => removeConnection(c.id)}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <button
            className="btn btn-outline full-width"
            onClick={() => navigate("connect")}
            style={{ marginTop: 12 }}
          >
            Add or switch connection
          </button>
        </section>

        <section className="settings-section">
          <h2>Security</h2>
          {!pwSection ? (
            <button className="btn btn-outline" onClick={() => setPwSection(true)}>
              Change password
            </button>
          ) : (
            <form onSubmit={handleChangePassword} className="pw-form">
              <input
                type="password"
                placeholder="Current password"
                value={oldPw}
                onChange={(e) => setOldPw(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="New password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
                minLength={6}
              />
              {pwMsg && <div className="pw-msg">{pwMsg}</div>}
              <button type="submit" className="btn btn-primary">Update</button>
            </form>
          )}
        </section>

        <section className="settings-section">
          <button className="btn btn-danger full-width" onClick={signOut}>
            Sign out
          </button>
        </section>
      </div>
    </div>
  );
}
