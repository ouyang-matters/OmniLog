import { useEffect, useRef, useState } from "react";
import { useApp } from "../../store/appStore";
import { Icon } from "../../assets/icons";

const MAX_AVATAR_BYTES = 192 * 1024; // image bytes (≈256 KB once base64-encoded)

/**
 * "Profile" tab — display name + avatar. Edits are buffered locally until the
 * user clicks Save so they can preview the avatar before committing.
 */
export function ProfileTab() {
  const me = useApp((s) => s.me);
  const updateProfile = useApp((s) => s.updateProfile);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(me?.displayName ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(me?.avatarDataUrl ?? null);
  const [avatarDirty, setAvatarDirty] = useState(false);
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "ok" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  useEffect(() => {
    setDisplayName(me?.displayName ?? "");
    setAvatarPreview(me?.avatarDataUrl ?? null);
    setAvatarDirty(false);
  }, [me?.id, me?.displayName, me?.avatarDataUrl]);

  function onPickFile() {
    fileInputRef.current?.click();
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so picking the same file again still fires
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus({ kind: "error", message: "Please pick an image file." });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setStatus({
        kind: "error",
        message: `Image is too big (${Math.round(file.size / 1024)} KB). Max ${MAX_AVATAR_BYTES / 1024} KB.`,
      });
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    setAvatarPreview(dataUrl);
    setAvatarDirty(true);
    setStatus({ kind: "idle" });
  }

  function onClearAvatar() {
    setAvatarPreview(null);
    setAvatarDirty(true);
  }

  const dirty = (me?.displayName ?? "") !== displayName.trim() || avatarDirty;

  async function onSave() {
    if (!dirty || !me) return;
    setStatus({ kind: "saving" });
    try {
      await updateProfile({
        displayName: displayName.trim(),
        avatarDataUrl: avatarDirty ? avatarPreview ?? "" : undefined,
      });
      setStatus({ kind: "ok" });
      setAvatarDirty(false);
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to save profile.",
      });
    }
  }

  if (!me) {
    return <div className="muted">Loading…</div>;
  }

  // The bootstrap principal (authenticated via the static API_TOKEN) has no
  // stored row — `auth::me` returns id = DEFAULT_USER_ID for it. We can't save
  // a profile for that identity; rotate the env-var token instead.
  const isBootstrap = me.id === "local-user";

  return (
    <div className="settings-pane">
      <h2>Profile</h2>
      {isBootstrap && (
        <div className="alert inline">
          You are signed in as the bootstrap admin (server API token). Create a
          regular user account to set a display name and avatar.
        </div>
      )}

      <div className="profile-row">
        <div className="avatar-block">
          <AvatarFrame src={avatarPreview} fallback={displayName || me.username} />
          <div className="avatar-actions">
            <button className="btn small" onClick={onPickFile} disabled={isBootstrap}>
              <Icon name="image" size={13} /> Choose…
            </button>
            {avatarPreview && (
              <button className="btn small ghost" onClick={onClearAvatar} disabled={isBootstrap}>
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={onFileChosen}
          />
        </div>

        <div className="profile-fields">
          <label className="field">
            <span>Username</span>
            <input type="text" value={me.username} disabled />
          </label>
          <label className="field">
            <span>Display name</span>
            <input
              type="text"
              placeholder={me.username}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isBootstrap}
            />
          </label>
          <div className="muted small">Role: <strong>{me.role}</strong></div>
        </div>
      </div>

      {status.kind === "ok" && <div className="alert ok inline">Profile saved.</div>}
      {status.kind === "error" && <div className="alert error inline">{status.message}</div>}

      <div className="actions">
        <button
          className="btn primary"
          disabled={!dirty || status.kind === "saving" || isBootstrap}
          onClick={() => void onSave()}
        >
          {status.kind === "saving" ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  );
}

interface AvatarProps {
  src: string | null | undefined;
  fallback: string;
  size?: number;
}

/**
 * Renders an avatar with a coloured letter fallback when no image is set.
 * Used in the topbar and the profile tab — shared so they look consistent.
 */
export function AvatarFrame({ src, fallback, size = 64 }: AvatarProps) {
  if (src) {
    return (
      <img
        className="avatar-img"
        style={{ width: size, height: size }}
        src={src}
        alt={fallback}
      />
    );
  }
  const initial = (fallback || "?").trim().charAt(0).toUpperCase();
  const hue = hashHue(fallback);
  return (
    <div
      className="avatar-fallback"
      style={{
        width: size,
        height: size,
        background: `hsl(${hue}, 60%, 55%)`,
        fontSize: Math.max(12, Math.floor(size * 0.45)),
      }}
    >
      {initial}
    </div>
  );
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
