import { useState } from "react";
import type { ServerConnection } from "@omnilog/shared";
import { useApp } from "../context";
import { Icon } from "../icons/index";
import { AddConnectionDialog } from "./AddConnectionDialog";

/**
 * "Connections" tab — manage every saved server. Pick one as active (switches
 * the client over), rename, delete, or add a new one.
 */
export function ConnectionsTab() {
  const connections = useApp((s) => s.connections);
  const activeId = useApp((s) => s.activeConnectionId);
  const switchConnection = useApp((s) => s.switchConnection);
  const renameConnection = useApp((s) => s.renameConnection);
  const removeConnection = useApp((s) => s.removeConnection);
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onActivate(c: ServerConnection) {
    if (c.id === activeId) return;
    setError(null);
    setBusyId(c.id);
    try {
      await switchConnection(c.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to switch server.");
    } finally {
      setBusyId(null);
    }
  }

  async function onRename(c: ServerConnection) {
    const next = window.prompt(`Rename "${c.name}" to:`, c.name);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === c.name) return;
    try {
      await renameConnection(c.id, trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed.");
    }
  }

  async function onRemove(c: ServerConnection) {
    const msg =
      c.id === activeId
        ? `Remove "${c.name}"? You will be signed out and switched to another saved server (if any).`
        : `Remove "${c.name}"? The saved URL and credentials will be deleted from this device. Your data on the server is not touched.`;
    if (!window.confirm(msg)) return;
    setError(null);
    try {
      await removeConnection(c.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove.");
    }
  }

  return (
    <div className="settings-pane">
      <h2>Connections</h2>
      <p className="muted small">
        Saved servers this client knows about. Switch any time — the active
        connection is the one your editor is reading from.
      </p>

      <ul className="connection-list">
        {connections.length === 0 && (
          <li className="muted">No connections yet.</li>
        )}
        {connections.map((c) => (
          <li
            key={c.id}
            className={`connection-row ${c.id === activeId ? "active" : ""}`}
          >
            <KindBadge kind={c.kind} large />
            <div className="connection-main">
              <div className="connection-name">
                <strong>{c.name}</strong>
                {c.id === activeId && <span className="muted small"> · active</span>}
                {c.license?.plan && (
                  <span className={`plan-badge plan-${c.license.plan}`}>
                    {c.license.plan}
                  </span>
                )}
              </div>
              <div className="muted small connection-url" title={c.serverUrl}>{c.serverUrl}</div>
              {c.lastConnectedAt && (
                <div className="muted small">
                  Last connected {new Date(c.lastConnectedAt).toLocaleString()}
                </div>
              )}
            </div>
            <div className="connection-actions">
              <button
                className="btn small"
                disabled={c.id === activeId || busyId === c.id}
                onClick={() => void onActivate(c)}
              >
                {busyId === c.id ? "Switching…" : "Use this"}
              </button>
              <button className="btn small" onClick={() => void onRename(c)} title="Rename">
                <Icon name="edit" size={13} />
              </button>
              <button className="btn small danger" onClick={() => void onRemove(c)} title="Remove">
                <Icon name="trash" size={13} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {error && <div className="alert error inline">{error}</div>}

      <div className="actions">
        <button className="btn primary" onClick={() => setShowAdd(true)}>
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
  );
}

function KindBadge({
  kind,
  large,
}: {
  kind: ServerConnection["kind"];
  large?: boolean;
}) {
  const labels: Record<ServerConnection["kind"], { text: string; cls: string }> = {
    "local-embedded": { text: "Local", cls: "kind-local" },
    "self-hosted": { text: "Self-hosted", cls: "kind-self" },
    "official": { text: "Official", cls: "kind-official" },
  };
  const { text, cls } = labels[kind];
  return <span className={`kind-badge ${cls} ${large ? "large" : ""}`}>{text}</span>;
}
