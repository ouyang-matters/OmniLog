import { useEffect, useState } from "react";
import { useApp, usePlatformUI } from "../context";

interface Props {
  onClose: () => void;
  onAdded: () => void;
}

type Kind = "self-hosted" | "official";
type AuthMode = "token" | "login";

export function AddConnectionDialog({ onClose, onAdded }: Props) {
  const addConnection = useApp((s) => s.addConnection);
  const loginAndConnect = useApp((s) => s.loginAndConnect);
  const platformUI = usePlatformUI();
  const [kind, setKind] = useState<Kind>("self-hosted");
  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("token");
  const [apiToken, setApiToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [activate, setActivate] = useState(true);
  const [test, setTest] = useState<
    | { kind: "idle" }
    | { kind: "testing" }
    | { kind: "ok"; name: string; version: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (platformUI.defaultDeviceName) {
      void platformUI.defaultDeviceName().then((n) => setDeviceName((d) => d || n));
    }
  }, [platformUI]);

  const officialDisabled = kind === "official";

  async function onTest() {
    if (!serverUrl.trim() || !apiToken.trim()) {
      setTest({ kind: "error", message: "Enter a server URL and API token first." });
      return;
    }
    if (!platformUI.testConnection) return;
    setTest({ kind: "testing" });
    try {
      const res = await platformUI.testConnection(serverUrl.trim(), apiToken.trim());
      if (res.ok) setTest({ kind: "ok", name: res.name, version: res.version });
      else setTest({ kind: "error", message: "Server responded but reported not ok." });
    } catch (e) {
      setTest({ kind: "error", message: e instanceof Error ? e.message : "Could not reach the server." });
    }
  }

  async function onSave() {
    if (officialDisabled) {
      setSaveError("The official hosted service is not available yet.");
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      if (authMode === "login") {
        // Use the core store's loginAndConnect which handles JWT acquisition
        // internally using the platform's fetch.
        await loginAndConnect({
          serverUrl: serverUrl.trim(),
          username: username.trim(),
          password,
          deviceName: deviceName.trim() || "My Device",
        });
        onAdded();
        return;
      }
      await addConnection({
        name: name.trim() || hostnameFromUrl(serverUrl) || "My server",
        kind: "self-hosted",
        serverUrl: serverUrl.trim(),
        apiToken: apiToken.trim(),
        deviceName: deviceName.trim() || "My Device",
        activate,
      });
      onAdded();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const canSave =
    !officialDisabled &&
    serverUrl.trim().length > 0 &&
    (authMode === "token"
      ? apiToken.trim().length > 0
      : username.trim().length > 0 && password.length > 0);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal add-connection" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Add server connection</h3>

        <div className="mode-group">
          <label className={`mode-option ${kind === "self-hosted" ? "selected" : ""}`}>
            <input
              type="radio"
              name="conn-kind"
              checked={kind === "self-hosted"}
              onChange={() => setKind("self-hosted")}
            />
            <div>
              <strong>Self-hosted server</strong>
              <span className="muted">Connect to a server you (or your team) run.</span>
            </div>
          </label>
          <label className={`mode-option ${kind === "official" ? "selected" : ""}`}>
            <input
              type="radio"
              name="conn-kind"
              checked={kind === "official"}
              onChange={() => setKind("official")}
            />
            <div>
              <strong>
                Official OmniLog <span className="badge">Coming soon</span>
              </strong>
              <span className="muted">
                Hosted by us with managed backups and (later) paid plans.
              </span>
            </div>
          </label>
        </div>

        <fieldset disabled={officialDisabled} className="fields">
          <label className="field">
            <span>Display name <em className="muted">(shown in the switcher)</em></span>
            <input
              type="text"
              placeholder="e.g. Home server"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Server URL</span>
            <input
              type="text"
              placeholder="https://omnilog.example.com"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
          </label>

          <div className="field">
            <span>Authentication</span>
            <div className="segmented">
              <button
                type="button"
                className={authMode === "token" ? "active" : ""}
                onClick={() => setAuthMode("token")}
              >
                API Token
              </button>
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => setAuthMode("login")}
              >
                Username & Password
              </button>
            </div>
          </div>

          {authMode === "token" ? (
            <label className="field">
              <span>API Token</span>
              <input
                type="password"
                placeholder="Your server's API_TOKEN"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                spellCheck={false}
              />
            </label>
          ) : (
            <>
              <label className="field">
                <span>Username</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            </>
          )}

          <label className="field">
            <span>Device Name <em className="muted">(optional)</em></span>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
            />
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={activate}
              onChange={(e) => setActivate(e.target.checked)}
            />
            <div>
              <strong>Switch to this server after saving</strong>
              <span className="muted">
                If unchecked, the connection is saved but you stay on the current server.
              </span>
            </div>
          </label>
        </fieldset>

        {test.kind === "ok" && (
          <div className="alert ok inline">
            Reached <strong>{test.name}</strong> (v{test.version}).
          </div>
        )}
        {test.kind === "error" && <div className="alert error inline">{test.message}</div>}
        {saveError && <div className="alert error inline">{saveError}</div>}

        <div className="actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn"
            onClick={() => void onTest()}
            disabled={authMode !== "token" || officialDisabled || test.kind === "testing"}
          >
            {test.kind === "testing" ? "Testing..." : "Test"}
          </button>
          <button
            className="btn primary"
            onClick={() => void onSave()}
            disabled={!canSave || saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
