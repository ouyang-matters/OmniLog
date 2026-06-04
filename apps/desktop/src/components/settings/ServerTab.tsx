import { useState } from "react";
import { useApp } from "../../store/appStore";

/**
 * "Server" tab — server-wide knobs everyone with admin or owner can touch.
 * Right now: the versioning toggle.
 */
export function ServerTab() {
  const settings = useApp((s) => s.settings);
  const setVersioning = useApp((s) => s.setVersioning);
  const config = useApp((s) => s.config);
  const [busy, setBusy] = useState(false);

  async function toggleVersioning(enabled: boolean) {
    setBusy(true);
    try {
      await setVersioning(enabled);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-pane">
      <h2>Server</h2>

      <section className="settings-section">
        <h4>Connection</h4>
        <div className="muted small">
          You are connected to <strong>{config?.serverUrl ?? "—"}</strong>
          {config?.managedLocal ? " (managed local server)" : ""}.
        </div>
      </section>

      <section className="settings-section">
        <h4>Version history</h4>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings?.versioningEnabled ?? true}
            disabled={busy}
            onChange={(e) => void toggleVersioning(e.target.checked)}
          />
          <div>
            <strong>Enable version history</strong>
            <span className="muted">
              Save a snapshot on every change so you can roll back. Applies
              server-wide.
            </span>
          </div>
        </label>
      </section>
    </div>
  );
}
