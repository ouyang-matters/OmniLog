import { useEffect, useState } from "react";
import type { Share } from "@omnilog/shared";
import { getClient } from "./context";
import { Icon } from "./icons/index";

interface Props {
  folderId: string;
  folderName: string;
  onClose: () => void;
}

export function ShareModal({ folderId, folderName, onClose }: Props) {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [form, setForm] = useState({ username: "", role: "editor" as Share["role"] });
  const [error, setError] = useState<string | null>(null);

  function reload() {
    const client = getClient();
    if (!client) return;
    client
      .listShares(folderId)
      .then(setShares)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load shares."));
  }

  useEffect(reload, [folderId]);

  async function onAdd() {
    const client = getClient();
    if (!client) return;
    setError(null);
    try {
      await client.createShare(folderId, { username: form.username.trim(), role: form.role });
      setForm({ username: "", role: "editor" });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to share.");
    }
  }

  async function onChangeRole(s: Share, role: Share["role"]) {
    const client = getClient();
    if (!client || s.role === role) return;
    setError(null);
    // Optimistic UI; revert on failure.
    setShares((prev) => prev?.map((x) => (x._id === s._id ? { ...x, role } : x)) ?? null);
    try {
      const updated = await client.updateShare(folderId, s.userId, { role });
      setShares((prev) => prev?.map((x) => (x._id === s._id ? updated : x)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change role.");
      reload();
    }
  }

  async function onRemove(userId: string) {
    const client = getClient();
    if (!client) return;
    await client.deleteShare(folderId, userId).catch(() => undefined);
    reload();
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Share "{folderName}"</h3>
        <p className="muted small">
          Give other users access to this folder and the documents inside it.
        </p>

        <ul className="version-list">
          {shares?.length === 0 && <li className="muted">Not shared with anyone yet.</li>}
          {shares?.map((s) => (
            <li key={s._id} className="version-item">
              <div className="version-main">
                <strong>{s.username}</strong>
                <span className="muted"> · added {s.createdAt.slice(0, 10)}</span>
              </div>
              <select
                value={s.role}
                onChange={(e) => void onChangeRole(s, e.target.value as Share["role"])}
              >
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
                <option value="owner">owner</option>
              </select>
              <button
                className="btn small danger"
                onClick={() => void onRemove(s.userId)}
                title="Remove access"
              >
                <Icon name="trash" size={13} />
              </button>
            </li>
          ))}
        </ul>

        <div className="user-form">
          <input
            placeholder="username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Share["role"] })}
          >
            <option value="viewer">viewer</option>
            <option value="editor">editor</option>
            <option value="owner">owner</option>
          </select>
          <button className="btn primary" onClick={() => void onAdd()}>
            Share
          </button>
        </div>
        {error && <div className="alert error inline">{error}</div>}

        <div className="actions">
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
