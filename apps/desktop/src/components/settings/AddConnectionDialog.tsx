import { useEffect, useState } from "react";
import { ApiClient as ApiClientClass } from "@omnilog/shared";
import { useApp } from "../../store/appStore";
import { rustFetch, testConnection } from "../../lib/api";
import { defaultDeviceName } from "../../lib/localServer";
import { OFFICIAL_SERVER_URL } from "../../lib/config";

interface Props {
  onClose: () => void;
  onAdded: () => void;
  /** Open the dialog pre-selected to a kind (e.g. "official" from setup). */
  initialKind?: Kind;
}

type Kind = "self-hosted" | "official";
type AuthMode = "token" | "login";
type AuthAction = "login" | "register";

/**
 * Modal for adding a saved connection. Self-hosted servers take a URL + token
 * or username/password. The official service uses a fixed URL and an in-app
 * sign-up / log-in flow (email + password).
 */
export function AddConnectionDialog({ onClose, onAdded, initialKind }: Props) {
  const addConnection = useApp((s) => s.addConnection);
  const [kind, setKind] = useState<Kind>(initialKind ?? "self-hosted");
  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("token");
  const [authAction, setAuthAction] = useState<AuthAction>("login");
  const [apiToken, setApiToken] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
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
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isOfficial = kind === "official";

  useEffect(() => {
    void defaultDeviceName().then((n) => setDeviceName((d) => d || n));
  }, []);

  async function onTest() {
    if (!serverUrl.trim() || !apiToken.trim()) {
      setTest({ kind: "error", message: "Enter a server URL and API token first." });
      return;
    }
    setTest({ kind: "testing" });
    try {
      const res = await testConnection(serverUrl.trim(), apiToken.trim());
      if (res.ok) setTest({ kind: "ok", name: res.name, version: res.version });
      else setTest({ kind: "error", message: "Server responded but reported not ok." });
    } catch (e) {
      setTest({ kind: "error", message: e instanceof Error ? e.message : "Could not reach the server." });
    }
  }

  async function onSave() {
    setSaveError(null);
    setInfo(null);
    setSaving(true);
    try {
      const baseUrl = isOfficial ? OFFICIAL_SERVER_URL : serverUrl.trim();
      let token = apiToken.trim();
      let resolvedName = username.trim();

      if (isOfficial) {
        const probe = new ApiClientClass({ baseUrl, token: "", fetch: rustFetch, timeoutMs: 15000 });
        if (authAction === "register") {
          await probe.register(username.trim(), email.trim(), password);
          setInfo("Account created. We sent a verification email - verify it to lift the free-tier limits.");
        }
        const res = await probe.login(username.trim(), password);
        token = res.token;
        resolvedName = res.user.username;
      } else if (authMode === "login") {
        const probe = new ApiClientClass({ baseUrl, token: "", fetch: rustFetch, timeoutMs: 8000 });
        const res = await probe.login(username.trim(), password);
        token = res.token;
        resolvedName = res.user.username;
      }

      await addConnection({
        name: name.trim() || (isOfficial ? "Official OmniLog" : hostnameFromUrl(baseUrl) || "My server"),
        kind,
        serverUrl: baseUrl,
        apiToken: token,
        deviceName: deviceName.trim() || resolvedName || "My Device",
        activate,
      });
      onAdded();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const canSave = isOfficial
    ? username.trim().length > 0 &&
      password.length > 0 &&
      (authAction === "login" || email.includes("@"))
    : serverUrl.trim().length > 0 &&
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
              <strong>Official OmniLog</strong>
              <span className="muted">
                Hosted by us with managed backups. Free tier with usage limits;
                upgrade for more.
              </span>
            </div>
          </label>
        </div>

        <fieldset className="fields">
          <label className="field">
            <span>Display name <em className="muted">(shown in the switcher)</em></span>
            <input
              type="text"
              placeholder={isOfficial ? "Official OmniLog" : "e.g. Home server"}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          {!isOfficial && (
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
          )}

          {isOfficial ? (
            <>
              <div className="field">
                <span>Account</span>
                <div className="segmented">
                  <button
                    type="button"
                    className={authAction === "login" ? "active" : ""}
                    onClick={() => setAuthAction("login")}
                  >
                    Log in
                  </button>
                  <button
                    type="button"
                    className={authAction === "register" ? "active" : ""}
                    onClick={() => setAuthAction("register")}
                  >
                    Sign up
                  </button>
                </div>
              </div>
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
              {authAction === "register" && (
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                </label>
              )}
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            </>
          ) : (
            <>
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
        {info && <div className="alert ok inline">{info}</div>}
        {saveError && <div className="alert error inline">{saveError}</div>}

        <div className="actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          {!isOfficial && (
            <button
              className="btn"
              onClick={() => void onTest()}
              disabled={authMode !== "token" || test.kind === "testing"}
            >
              {test.kind === "testing" ? "Testing..." : "Test"}
            </button>
          )}
          <button
            className="btn primary"
            onClick={() => void onSave()}
            disabled={!canSave || saving}
          >
            {saving
              ? isOfficial && authAction === "register"
                ? "Creating..."
                : "Connecting..."
              : isOfficial
                ? authAction === "register"
                  ? "Sign up"
                  : "Log in"
                : "Save"}
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
