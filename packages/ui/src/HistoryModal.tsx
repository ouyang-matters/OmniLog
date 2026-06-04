import { useEffect, useState } from "react";
import type { EntryVersion } from "@omnilog/shared";
import { getClient, useApp } from "./context";

interface Props {
  entryId: string;
  onClose: () => void;
}

export function HistoryModal({ entryId, onClose }: Props) {
  const restoreVersion = useApp((s) => s.restoreVersion);
  const [versions, setVersions] = useState<EntryVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const client = getClient();
    if (!client) {
      setError("Not connected.");
      return;
    }
    client
      .listVersions(entryId)
      .then(setVersions)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load history."));
  }, [entryId]);

  async function onRestore(version: number) {
    if (!confirm(`Restore version ${version}? Current content is saved to history first.`)) {
      return;
    }
    setBusy(true);
    try {
      await restoreVersion(version);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Version history</h3>

        {error && <div className="alert error">{error}</div>}
        {!versions && !error && <div className="muted">Loading...</div>}
        {versions && versions.length === 0 && (
          <div className="muted">No history yet. Edits will be snapshotted here.</div>
        )}

        <ul className="version-list">
          {versions?.map((v) => (
            <li key={v._id} className="version-item">
              <div className="version-main">
                <strong>v{v.version}</strong>
                <span className="muted"> · {new Date(v.createdAt).toLocaleString()}</span>
                <div className="version-preview muted">
                  {v.title || "(untitled)"} — {v.contentText.slice(0, 80) || "—"}
                </div>
              </div>
              <button className="btn small" disabled={busy} onClick={() => void onRestore(v.version)}>
                Restore
              </button>
            </li>
          ))}
        </ul>

        <div className="actions">
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
