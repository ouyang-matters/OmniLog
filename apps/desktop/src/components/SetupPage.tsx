import { useEffect, useState } from "react";
import { testConnection } from "../lib/api";
import { defaultDeviceName, killPort, PortInUseError } from "../lib/localServer";
import { useApp } from "../store/appStore";
import { AddConnectionDialog } from "./settings/AddConnectionDialog";

type Mode = "custom" | "official";
type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; name: string; version: string }
  | { kind: "error"; message: string };

type QuickState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "port-conflict"; port: number }
  | { kind: "error"; message: string };

type AuthMode = "token" | "login";

export function SetupPage() {
  const completeSetup = useApp((s) => s.completeSetup);
  const quickStart = useApp((s) => s.quickStartLocalServer);
  const loginAndConnect = useApp((s) => s.loginAndConnect);
  const startOffline = useApp((s) => s.startOffline);
  const existing = useApp((s) => s.config);

  const [mode, setMode] = useState<Mode>("custom");
  const [authMode, setAuthMode] = useState<AuthMode>("token");
  const [serverUrl, setServerUrl] = useState(existing?.serverUrl ?? "http://localhost:3000");
  const [apiToken, setApiToken] = useState(existing?.apiToken ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState(existing?.deviceName ?? "");
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [quick, setQuick] = useState<QuickState>({ kind: "idle" });
  const [customPort, setCustomPort] = useState("");
  const [showOfficial, setShowOfficial] = useState(false);

  // Prefill a sensible default device name on first load.
  useEffect(() => {
    if (!deviceName) {
      void defaultDeviceName().then((n) => setDeviceName((d) => d || n));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onQuickStart(port?: number) {
    setQuick({ kind: "starting" });
    try {
      await quickStart(port);
      // On success the app advances to the main UI automatically.
    } catch (e) {
      if (e instanceof PortInUseError) {
        setCustomPort(String(e.suggestedPort));
        setQuick({ kind: "port-conflict", port: e.port });
      } else {
        setQuick({
          kind: "error",
          message: e instanceof Error ? e.message : "Could not start the local server.",
        });
      }
    }
  }

  function onUseCustomPort() {
    const port = Number(customPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setQuick({ kind: "error", message: "Enter a valid port between 1 and 65535." });
      return;
    }
    void onQuickStart(port);
  }

  async function onFreePortAndRetry(port: number) {
    setQuick({ kind: "starting" });
    await killPort(port);
    // Give the OS a moment to release the socket, then retry the same port.
    await new Promise((r) => setTimeout(r, 600));
    void onQuickStart(port);
  }

  const canSave =
    mode === "custom" &&
    serverUrl.trim().length > 0 &&
    (authMode === "token"
      ? apiToken.trim().length > 0
      : username.trim().length > 0 && password.length > 0);

  async function onTest() {
    if (!serverUrl.trim() || !apiToken.trim()) {
      setTest({ kind: "error", message: "Enter a server URL and API token first." });
      return;
    }
    setTest({ kind: "testing" });
    try {
      const res = await testConnection(serverUrl.trim(), apiToken.trim());
      if (res.ok) {
        setTest({ kind: "ok", name: res.name, version: res.version });
      } else {
        setTest({ kind: "error", message: "Server responded but reported not ok." });
      }
    } catch (e) {
      setTest({
        kind: "error",
        message: e instanceof Error ? e.message : "Could not reach the server.",
      });
    }
  }

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (authMode === "login") {
        await loginAndConnect({
          serverUrl: serverUrl.trim(),
          username: username.trim(),
          password,
          deviceName: deviceName.trim(),
        });
      } else {
        await completeSetup({
          mode: "custom",
          serverUrl: serverUrl.trim(),
          apiToken: apiToken.trim(),
          deviceName: deviceName.trim() || "My Device",
        });
      }
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : "Could not connect. Check your details.",
      );
    } finally {
      setSaving(false);
    }
  }

  function onReset() {
    setServerUrl("http://localhost:3000");
    setApiToken("");
    setDeviceName("");
    setTest({ kind: "idle" });
  }

  return (
    <div className="setup">
      <div className="setup-card">
        <h1>Welcome to OmniLog</h1>
        <p className="muted">
          OmniLog is a self-hosted-first work journal. Connect to your own server
          to get started.
        </p>

        <div className="quickstart">
          <div className="quickstart-text">
            <strong>One-click local server</strong>
            <span className="muted">
              Run a server on this computer with no setup - no database to install.
              Default connection info is saved automatically.
            </span>
            {quick.kind === "error" && (
              <span className="alert error inline">{quick.message}</span>
            )}
          </div>
          <button
            className="btn primary"
            onClick={() => onQuickStart()}
            disabled={quick.kind === "starting"}
          >
            {quick.kind === "starting" ? "Starting..." : "Start local server"}
          </button>
        </div>

        {quick.kind === "port-conflict" && (
          <div className="port-conflict">
            <div className="alert error inline">
              Port {quick.port} is already in use. Choose another port, or stop
              the process using it.
            </div>
            <div className="port-row">
              <label className="field port-field">
                <span>Port</span>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={customPort}
                  onChange={(e) => setCustomPort(e.target.value)}
                />
              </label>
              <button className="btn primary" onClick={onUseCustomPort}>
                Use this port
              </button>
              <button className="btn danger" onClick={() => void onFreePortAndRetry(quick.port)}>
                Stop process on {quick.port}
              </button>
            </div>
          </div>
        )}

        <div className="divider"><span>or connect manually</span></div>

        <div className="mode-group">
          <label className={`mode-option ${mode === "custom" ? "selected" : ""}`}>
            <input
              type="radio"
              name="mode"
              checked={mode === "custom"}
              onChange={() => setMode("custom")}
            />
            <div>
              <strong>Custom self-hosted server</strong>
              <span className="muted">Connect to a server you run yourself.</span>
            </div>
          </label>

          <button
            type="button"
            className="mode-option official-cta"
            onClick={() => setShowOfficial(true)}
          >
            <div>
              <strong>Official OmniLog</strong>
              <span className="muted">
                Sign up or log in to the hosted service. Free tier with usage
                limits; upgrade for more.
              </span>
            </div>
            <span className="official-arrow">&rsaquo;</span>
          </button>

          <button
            type="button"
            className="mode-option official-cta"
            onClick={() => void startOffline()}
          >
            <div>
              <strong>Offline (local-only)</strong>
              <span className="muted">
                No account, no server, no limits. Entries and images stay on
                this device and are never uploaded.
              </span>
            </div>
            <span className="official-arrow">&rsaquo;</span>
          </button>
        </div>

        {showOfficial && (
          <AddConnectionDialog
            initialKind="official"
            onClose={() => setShowOfficial(false)}
            onAdded={() => setShowOfficial(false)}
          />
        )}

        <fieldset disabled={mode !== "custom"} className="fields">
          <label className="field">
            <span>Server URL</span>
            <input
              type="text"
              placeholder="http://localhost:3000"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
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
                Username &amp; Password
              </button>
            </div>
          </div>

          {authMode === "login" && (
            <>
              <label className="field">
                <span>Username</span>
                <input
                  type="text"
                  placeholder="e.g. admin"
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
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            </>
          )}

          <label className="field" style={{ display: authMode === "token" ? undefined : "none" }}>
            <span>API Token</span>
            <input
              type="password"
              placeholder="Your server's API_TOKEN"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </label>

          <label className="field">
            <span>Device Name <em className="muted">(optional)</em></span>
            <input
              type="text"
              placeholder="e.g. Work Laptop"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
            />
          </label>
        </fieldset>

        {test.kind === "ok" && (
          <div className="alert ok">
            Connected to <strong>{test.name}</strong> (v{test.version}).
          </div>
        )}
        {test.kind === "error" && (
          <div className="alert error">{test.message}</div>
        )}
        {saveError && <div className="alert error">{saveError}</div>}

        <div className="actions">
          <button
            className="btn"
            onClick={onTest}
            disabled={mode !== "custom" || authMode !== "token" || test.kind === "testing"}
          >
            {test.kind === "testing" ? "Testing..." : "Test Connection"}
          </button>
          <button className="btn ghost" onClick={onReset} disabled={mode !== "custom"}>
            Reset Settings
          </button>
          <button className="btn primary" onClick={onSave} disabled={!canSave || saving}>
            {saving ? "Saving..." : "Save and Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
