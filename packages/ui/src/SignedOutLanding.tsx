import { useState } from "react";
import type { ServerConnection } from "@omnilog/shared";
import { useApp } from "./context";
import { AddConnectionDialog } from "./settings/AddConnectionDialog";

/**
 * Shown after sign-out when the client still remembers one or more saved
 * connections. Lets the user pick one (re-activates and reconnects) or add a
 * new one — without forcing them through the first-run SetupPage again.
 *
 * On a fresh install or after a full reset, `connections` is empty and
 * `App.tsx` falls through to the regular SetupPage instead.
 */
export function SignedOutLanding() {
  const connections = useApp((s) => s.connections);
  const switchConnection = useApp((s) => s.switchConnection);
  const removeConnection = useApp((s) => s.removeConnection);
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPick(c: ServerConnection) {
    setError(null);
    setBusyId(c.id);
    try {
      await switchConnection(c.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect.");
    } finally {
      setBusyId(null);
    }
  }

  async function onRemove(c: ServerConnection) {
    if (!window.confirm(`Remove "${c.name}" from this device?`)) return;
    await removeConnection(c.id);
  }

  return (
    <div className="setup">
      <div className="setup-card">
        <h1>Pick a server</h1>
        <p className="muted">
          You're signed out. Pick one of your saved servers to reconnect, or
          add a new one.
        </p>

        <ul className="connection-list">
          {connections.map((c) => (
            <li key={c.id} className="connection-row">
              <span className={`kind-badge large kind-${c.kind === "local-embedded" ? "local" : c.kind === "official" ? "official" : "self"}`}>
                {c.kind === "local-embedded" ? "Local" : c.kind === "official" ? "Official" : "Self-hosted"}
              </span>
              <div className="connection-main">
                <div className="connection-name"><strong>{c.name}</strong></div>
                <div className="muted small connection-url">{c.serverUrl}</div>
              </div>
              <div className="connection-actions">
                <button
                  className="btn primary small"
                  disabled={busyId !== null}
                  onClick={() => void onPick(c)}
                >
                  {busyId === c.id ? "Connecting…" : "Connect"}
                </button>
                <button
                  className="btn small danger"
                  onClick={() => void onRemove(c)}
                  title="Remove from this device"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>

        {error && <div className="alert error inline">{error}</div>}

        <div className="actions">
          <button className="btn" onClick={() => setShowAdd(true)}>
            + Add server
          </button>
        </div>

        {showAdd && (
          <AddConnectionDialog
            onClose={() => setShowAdd(false)}
            onAdded={() => setShowAdd(false)}
          />
        )}
      </div>
    </div>
  );
}
