import { useEffect, useState } from "react";
import type { PublicUser, Role } from "@omnilog/shared";
import { getClient, useApp } from "../context";
import { Icon } from "../icons/index";
import { AvatarFrame } from "./ProfileTab";

/**
 * "Users" tab — admin can manage `user` accounts; owner can also manage
 * admins and other owners. Role rank is mirrored from the server: owner > admin > user.
 */
const ROLE_RANK: Record<Role, number> = { owner: 3, admin: 2, user: 1 };

export function UsersTab() {
  const me = useApp((s) => s.me);
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [newUser, setNewUser] = useState<{ username: string; password: string; role: Role; displayName: string }>({
    username: "",
    password: "",
    role: "user",
    displayName: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = getClient();
    if (!client) return;
    client.listUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  function refresh() {
    const client = getClient();
    if (!client) return;
    client.listUsers().then(setUsers).catch(() => undefined);
  }

  async function onCreate() {
    const client = getClient();
    if (!client) return;
    setError(null);
    try {
      const created = await client.createUser({
        username: newUser.username.trim(),
        password: newUser.password,
        role: newUser.role,
        displayName: newUser.displayName.trim() || undefined,
      });
      setUsers((prev) => [...(prev ?? []), created]);
      setNewUser({ username: "", password: "", role: "user", displayName: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user.");
    }
  }

  async function onSetRole(u: PublicUser, role: Role) {
    const client = getClient();
    if (!client || u.role === role) return;
    setError(null);
    try {
      const updated = await client.updateUser(u.id, { role });
      setUsers((prev) => prev?.map((x) => (x.id === u.id ? updated : x)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role.");
    }
  }

  async function onResetPassword(u: PublicUser) {
    const client = getClient();
    if (!client) return;
    const next = window.prompt(`Set a new password for "${u.username}":`, "");
    if (!next) return;
    setError(null);
    try {
      await client.updateUser(u.id, { password: next });
      window.alert(`Password reset for ${u.username}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset password.");
    }
  }

  async function onEditDisplayName(u: PublicUser) {
    const client = getClient();
    if (!client) return;
    const next = window.prompt(`Display name for "${u.username}":`, u.displayName ?? "");
    if (next === null) return;
    setError(null);
    try {
      const updated = await client.updateUser(u.id, { displayName: next });
      setUsers((prev) => prev?.map((x) => (x.id === u.id ? updated : x)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update display name.");
    }
  }

  async function onDelete(u: PublicUser) {
    const client = getClient();
    if (!client) return;
    if (!window.confirm(`Delete user "${u.username}"? Their folders and entries are kept.`)) {
      return;
    }
    setError(null);
    try {
      await client.deleteUser(u.id);
      setUsers((prev) => prev?.filter((x) => x.id !== u.id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete user.");
      refresh();
    }
  }

  const myRank = me ? ROLE_RANK[me.role] : 0;
  const canCreateAdmin = me?.role === "owner";

  return (
    <div className="settings-pane">
      <h2><Icon name="users" size={16} /> Users</h2>
      <p className="muted small">
        {me?.role === "owner"
          ? "As owner, you can manage admins and other users."
          : "As an admin, you can manage user accounts. Only owners can create or edit admins."}
      </p>

      <ul className="user-list">
        {users?.map((u) => {
          const targetRank = ROLE_RANK[u.role] ?? 0;
          const editingSelf = u.id === me?.id;
          // Outranking rule mirrored from the server.
          const canEdit = editingSelf || targetRank < myRank;
          const canSetAdmin = me?.role === "owner";
          return (
            <li key={u.id} className="user-row">
              <AvatarFrame src={u.avatarDataUrl ?? null} fallback={u.displayName || u.username} size={36} />
              <div className="user-id">
                <div>
                  <strong>{u.displayName || u.username}</strong>
                  {u.displayName && <span className="muted small"> @{u.username}</span>}
                </div>
                <div className="muted small">Created {u.createdAt.slice(0, 10) || "—"}</div>
              </div>

              <select
                value={u.role}
                onChange={(e) => void onSetRole(u, e.target.value as Role)}
                disabled={!canEdit}
                title={!canEdit ? "You can't change this user's role" : "Change role"}
              >
                <option value="user">user</option>
                <option value="admin" disabled={!canSetAdmin}>admin</option>
                <option value="owner" disabled={!canSetAdmin}>owner</option>
              </select>

              <button
                className="btn small"
                onClick={() => void onEditDisplayName(u)}
                disabled={!canEdit}
                title="Edit display name"
              >
                <Icon name="edit" size={13} />
              </button>
              <button
                className="btn small"
                onClick={() => void onResetPassword(u)}
                disabled={!canEdit}
                title="Reset password"
              >
                <Icon name="key" size={13} />
              </button>
              <button
                className="btn small danger"
                onClick={() => void onDelete(u)}
                disabled={!canEdit || editingSelf}
                title={editingSelf ? "You cannot delete yourself" : "Delete user"}
              >
                <Icon name="trash" size={13} />
              </button>
            </li>
          );
        })}
        {users && users.length === 0 && <li className="muted">No users yet.</li>}
      </ul>

      <section className="settings-section">
        <h4>Add user</h4>
        <div className="user-form">
          <input
            placeholder="username"
            value={newUser.username}
            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
          />
          <input
            placeholder="display name (optional)"
            value={newUser.displayName}
            onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })}
          />
          <input
            type="password"
            placeholder="password"
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
          />
          <select
            value={newUser.role}
            onChange={(e) => setNewUser({ ...newUser, role: e.target.value as Role })}
          >
            <option value="user">user</option>
            <option value="admin" disabled={!canCreateAdmin}>admin</option>
            <option value="owner" disabled={!canCreateAdmin}>owner</option>
          </select>
          <button className="btn primary" onClick={() => void onCreate()}>
            Add
          </button>
        </div>
      </section>

      {error && <div className="alert error inline">{error}</div>}
    </div>
  );
}
