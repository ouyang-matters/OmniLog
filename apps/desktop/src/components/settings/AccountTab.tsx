import { useState } from "react";
import { useApp } from "../../store/appStore";
import { Icon } from "../../assets/icons";

/**
 * "Account" tab — change password + sign out. The sign-out button drops the
 * stored connection config and returns to the setup screen.
 */
export function AccountTab() {
  const me = useApp((s) => s.me);
  const signOut = useApp((s) => s.signOut);
  const changePassword = useApp((s) => s.changePassword);
  const closeSettings = useApp((s) => s.closeSettings);

  const [pw, setPw] = useState({ oldPassword: "", newPassword: "", confirm: "" });
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "ok" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.newPassword.length < 4) {
      setState({ kind: "error", message: "New password must be at least 4 characters." });
      return;
    }
    if (pw.newPassword !== pw.confirm) {
      setState({ kind: "error", message: "New password and confirmation don't match." });
      return;
    }
    setState({ kind: "saving" });
    try {
      await changePassword(pw.oldPassword, pw.newPassword);
      setPw({ oldPassword: "", newPassword: "", confirm: "" });
      setState({ kind: "ok" });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Could not change password.",
      });
    }
  }

  return (
    <div className="settings-pane">
      <h2>Account</h2>

      <section className="settings-section">
        <h4><Icon name="key" size={12} /> Change password</h4>
        <form className="user-form column" onSubmit={onSubmit}>
          <input
            type="password"
            placeholder="Current password"
            autoComplete="current-password"
            value={pw.oldPassword}
            onChange={(e) => setPw({ ...pw, oldPassword: e.target.value })}
          />
          <input
            type="password"
            placeholder="New password"
            autoComplete="new-password"
            value={pw.newPassword}
            onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            autoComplete="new-password"
            value={pw.confirm}
            onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
          />
          <button
            className="btn primary"
            type="submit"
            disabled={state.kind === "saving" || !pw.oldPassword || !pw.newPassword}
          >
            {state.kind === "saving" ? "Saving…" : "Update password"}
          </button>
        </form>
        {state.kind === "ok" && <div className="alert ok inline">Password updated.</div>}
        {state.kind === "error" && <div className="alert error inline">{state.message}</div>}
      </section>

      <section className="settings-section">
        <h4>Sign out</h4>
        <div className="muted small" style={{ marginBottom: 8 }}>
          Signed in as <strong>{me?.username ?? "—"}</strong>. Signing out
          disconnects this client and returns you to the setup screen — your
          journal entries on the server are kept.
        </div>
        <button
          className="btn danger"
          onClick={() => {
            if (window.confirm("Sign out and return to the setup screen?")) {
              void signOut();
              closeSettings();
            }
          }}
        >
          <Icon name="logout" size={13} /> Sign out
        </button>
      </section>
    </div>
  );
}
