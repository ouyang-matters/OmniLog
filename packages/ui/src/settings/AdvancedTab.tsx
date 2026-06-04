import { useEffect, useState } from "react";
import type { ServerInfo } from "@omnilog/shared";
import { getClient } from "../context";

/**
 * "Advanced" tab — owner-only. Surfaces the runtime config the server actually
 * booted with (database, ports, data dir, embedded vs Mongo) and lets the
 * owner edit the small subset that can be overridden at runtime (CORS, a
 * free-form public-URL note).
 *
 * Anything sourced from env vars needs a server restart to actually take
 * effect; we render a yellow banner whenever the update reports that.
 */
export function AdvancedTab() {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cors, setCors] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [saved, setSaved] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "ok"; restartRequired: boolean } | { kind: "error"; message: string }
  >({ kind: "idle" });

  useEffect(() => {
    const client = getClient();
    if (!client) return;
    client.getServerInfo()
      .then((s) => {
        setInfo(s);
        setCors(s.corsOriginEffective);
        setPublicUrl(s.publicUrl ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load."));
  }, []);

  async function onSave() {
    const client = getClient();
    if (!client) return;
    setSaved({ kind: "saving" });
    try {
      const res = await client.updateServerInfo({
        corsOrigin: cors,
        publicUrl,
      });
      setSaved({ kind: "ok", restartRequired: res.restartRequired });
      // Re-fetch so the dashboard reflects new effective values.
      const fresh = await client.getServerInfo();
      setInfo(fresh);
    } catch (e) {
      setSaved({ kind: "error", message: e instanceof Error ? e.message : "Failed to save." });
    }
  }

  if (error) {
    return (
      <div className="settings-pane">
        <h2>Advanced</h2>
        <div className="alert error inline">{error}</div>
      </div>
    );
  }
  if (!info) {
    return (
      <div className="settings-pane">
        <h2>Advanced</h2>
        <div className="muted">Loading…</div>
      </div>
    );
  }

  const corsDirty = cors !== info.corsOriginEffective;
  const publicDirty = (publicUrl || undefined) !== info.publicUrl;
  const dirty = corsDirty || publicDirty;

  return (
    <div className="settings-pane">
      <h2>Advanced</h2>
      <p className="muted small">
        Owner-only. Values labelled <em>env-bound</em> need a server restart to
        actually take effect.
      </p>

      <section className="settings-section">
        <h4>Database</h4>
        <DataRow label="Backend" value={info.embedded ? "Embedded JSON (no MongoDB)" : "MongoDB"} />
        {!info.embedded && (
          <>
            <DataRow label="Database name" value={info.databaseName} hint="env-bound" />
            <DataRow label="Connection URI" value={info.databaseUriMasked} hint="env-bound (credentials masked)" mono />
          </>
        )}
        <DataRow label="Data directory" value={info.dataDir} hint="env-bound" mono />
        <DataRow label="Users on server" value={String(info.userCount)} />
      </section>

      <section className="settings-section">
        <h4>Networking</h4>
        <DataRow label="Host" value={info.host} hint="env-bound" />
        <DataRow label="Port" value={String(info.port)} hint="env-bound" />
        <DataRow
          label="CORS allowlist (booted with)"
          value={info.corsOriginEnv === "*" ? "any origin" : info.corsOriginEnv}
          hint="env-bound"
          mono
        />

        <label className="field">
          <span>CORS override (runtime)</span>
          <input
            type="text"
            value={cors}
            placeholder="*  or  https://app.example.com,https://other.example"
            onChange={(e) => setCors(e.target.value)}
            spellCheck={false}
          />
          <span className="muted small">
            Stored so the next restart picks it up. Takes effect after restart.
          </span>
        </label>

        <label className="field">
          <span>Public URL (note)</span>
          <input
            type="text"
            value={publicUrl}
            placeholder="https://omnilog.example.com  or  tailscale://your-host:3000"
            onChange={(e) => setPublicUrl(e.target.value)}
            spellCheck={false}
          />
          <span className="muted small">
            For your own reference — record the URL you've mapped this server
            to from outside the LAN (reverse proxy, Tailscale, ngrok, etc.).
            Used as the suggested address when sharing a setup link.
          </span>
        </label>

        <div className="actions">
          <button
            className="btn primary"
            disabled={!dirty || saved.kind === "saving"}
            onClick={() => void onSave()}
          >
            {saved.kind === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
        {saved.kind === "ok" && (
          <div className={`alert inline ${saved.restartRequired ? "" : "ok"}`}>
            Saved.
            {saved.restartRequired && " Restart the server for the new CORS allowlist to apply."}
          </div>
        )}
        {saved.kind === "error" && <div className="alert error inline">{saved.message}</div>}
      </section>

      <section className="settings-section">
        <h4>Build</h4>
        <DataRow label="Server version" value={info.version} />
        <DataRow
          label="Authenticated via"
          value={info.viaApiToken ? "Static API token (bootstrap admin)" : "User account JWT"}
        />
      </section>
    </div>
  );
}

function DataRow({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="data-row">
      <div className="data-label">
        <span>{label}</span>
        {hint && <span className="muted small data-hint">{hint}</span>}
      </div>
      <div className={`data-value ${mono ? "mono" : ""}`}>{value}</div>
    </div>
  );
}
