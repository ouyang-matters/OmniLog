/**
 * Core domain types shared between the Tauri desktop client and the Axum
 * server. These mirror the JSON shapes exchanged over the REST API (camelCase),
 * so the Rust models serialize to exactly these fields.
 */

export type SyncStatus = "local" | "synced" | "dirty" | "conflict";

export type AssetType = "image";

/**
 * Editor mode an entry was authored in:
 * - `"rich"`: TipTap/ProseMirror — canonical content is `contentJson`
 * - `"latex"`: raw LaTeX source — canonical content is `contentText`
 * - `"markdown"`: Markdown source — canonical content is `contentText`
 *
 * Older entries that predate this field default to `"rich"`.
 */
export type EntryMode = "rich" | "latex" | "markdown";

/** A single work-log entry. `contentJson` is the TipTap/ProseMirror document. */
export interface WorklogEntry {
  _id: string;
  userId: string;
  /** Folder the entry lives in. null/undefined = root. */
  folderId?: string | null;
  title: string;
  /** ISO date (YYYY-MM-DD) the entry is filed under. */
  date: string;
  /** TipTap/ProseMirror JSON document. `unknown` so the client owns the shape. */
  contentJson: unknown;
  /** Plain-text projection used for search and word count. */
  contentText: string;
  /** Optional rendered HTML snapshot. */
  contentHtml?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  version: number;
  syncStatus: SyncStatus;
  deviceId: string;
  contentHash?: string;
  /** Editor mode. Absent on legacy entries — treat as "rich". */
  mode?: EntryMode;
}

export interface Asset {
  _id: string;
  userId: string;
  entryId: string;
  type: AssetType;
  fileName: string;
  originalName?: string;
  mimeType: string;
  size: number;
  /** Server-relative storage path under DATA_DIR (never an absolute FS path). */
  storagePath: string;
  /** API path the client can GET (with auth) to fetch the binary. */
  publicUrl?: string;
  width?: number;
  height?: number;
  caption?: string;
  createdAt: string;
  updatedAt: string;
  contentHash?: string;
}

/**
 * A folder / sub-project. Nests via parentId (null = top level).
 *
 * `myRole` and `ownerUsername` are populated by `GET /api/folders` so the UI
 * can distinguish folders the caller owns from folders shared with them. They
 * are absent on folders returned by older clients/endpoints.
 */
export interface Folder {
  _id: string;
  userId: string;
  parentId?: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** "owner" | "editor" | "viewer". Absent on legacy responses. */
  myRole?: "owner" | "editor" | "viewer";
  /** Owner's username for folders shared with the caller. */
  ownerUsername?: string;
}

/** A historical snapshot of an entry (version history). */
export interface EntryVersion {
  _id: string;
  entryId: string;
  userId: string;
  version: number;
  title: string;
  date: string;
  contentJson: unknown;
  contentText: string;
  contentHtml?: string;
  tags: string[];
  createdAt: string;
  deviceId: string;
  mode?: EntryMode;
}

/** Server-wide settings. */
export interface ServerSettings {
  versioningEnabled: boolean;
}

/**
 * Role hierarchy: `owner` > `admin` > `user`. The bootstrap principal
 * (API_TOKEN) is treated as `owner` even though it has no stored row.
 */
export type Role = "owner" | "admin" | "user";

/** A user account (no secrets). */
export interface PublicUser {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
  displayName?: string;
  /** Inline `data:image/...;base64,…` URL. Capped server-side. */
  avatarDataUrl?: string;
}

export interface LoginResponse {
  token: string;
  user: PublicUser;
}

/** A folder share grant. role: viewer | editor | owner. */
export interface Share {
  _id: string;
  folderId: string;
  userId: string;
  username: string;
  role: "viewer" | "editor" | "owner";
  createdAt: string;
}

/**
 * Notification / inbox message. `kind` is a stable identifier the UI switches
 * on for icon and routing; `linkFolderId` is an optional destination.
 */
export type MessageKind =
  | "folder.shared"
  | "folder.unshared"
  | "folder.renamed"
  | "folder.deleted"
  | "share.role_changed"
  | "user.updated"
  | "user.password_changed";

export interface Message {
  _id: string;
  userId: string;
  kind: MessageKind | string;
  title: string;
  body: string;
  linkFolderId?: string | null;
  createdAt: string;
  /** null/undefined = unread. */
  readAt?: string | null;
}

/** GET /health response. */
export interface HealthResponse {
  ok: boolean;
  name: string;
  version: string;
}

/**
 * Owner-only view of server-side runtime configuration.
 *
 * `databaseUriMasked` is the connection string with credentials replaced by
 * `****`. `corsOriginEnv` is what the server booted with from env vars;
 * `corsOriginEffective` reflects the runtime override stored in settings (if
 * any). Restart is required for env-bound changes to actually take effect.
 */
export interface ServerInfo {
  version: string;
  host: string;
  port: number;
  dataDir: string;
  embedded: boolean;
  databaseName: string;
  databaseUriMasked: string;
  corsOriginEnv: string;
  corsOriginEffective: string;
  publicUrl?: string;
  userCount: number;
  /** True if the caller authenticated with the static API_TOKEN. */
  viaApiToken: boolean;
}

/**
 * Kind of remote a `ServerConnection` points at. Used by the UI to badge the
 * connection and (in the future) to decide whether to surface license / plan
 * affordances.
 *
 * - `local-embedded` — the client-managed one-click local server (Tauri
 *   spawns the bundled binary; it's re-started on launch).
 * - `self-hosted` — an arbitrary server URL the user pointed at.
 * - `official` — Anthropic-of-OmniLog's hosted service. Not yet live;
 *   reserved so the client knows to fetch a license and show a plan badge
 *   once the hosted service ships.
 */
export type ServerKind = "local-embedded" | "self-hosted" | "official";

/**
 * Subscription / entitlement returned by the (future) official hosted service.
 * Self-hosted servers may also return this if their operator wires up a
 * license endpoint, but the field is optional everywhere.
 */
export interface License {
  plan: "free" | "pro" | "team";
  /** Stripe subscription status verbatim (e.g. "active", "past_due"). */
  status?: string;
  /** ISO timestamp of the current billing period end. */
  currentPeriodEnd?: string;
  /** ISO timestamp. Absent = unlimited / lifetime. */
  expiresAt?: string;
  /** Opaque subscription id from the billing system. Display-only. */
  subscriptionId?: string;
  /** Free-form features unlocked by this plan (e.g. "cloud-backup"). */
  features?: string[];
}

/**
 * One saved server entry. The client persists a list of these so the user can
 * switch between (say) their home server and the official hosted service
 * without re-entering credentials each time.
 *
 * `apiToken` is either the static `API_TOKEN` for the server (self-hosted) or
 * a JWT obtained from `/api/auth/login`. The two are interchangeable from the
 * client's perspective.
 */
export interface ServerConnection {
  /** Stable per-connection id (UUID). Used as the dictionary key on disk. */
  id: string;
  /** User-friendly label shown in the switcher. */
  name: string;
  kind: ServerKind;
  serverUrl: string;
  apiToken: string;
  /** Device label this client identifies itself as for this server. */
  deviceName: string;
  /**
   * True when the client started a local server for this connection — on
   * launch the client re-spawns it before connecting.
   */
  managedLocal?: boolean;
  /** Last successful connection time (ISO). */
  lastConnectedAt?: string;
  /** Hint for "official" connections; populated after a /license fetch. */
  license?: License;
}

/**
 * Legacy single-server shape kept around for migration. New code should use
 * `ServerConnection` + the connections list from `appStore`.
 *
 * @deprecated Use ServerConnection. Persisted records in this shape are
 * migrated into the connections list on first load.
 */
export interface ServerConfig {
  mode: "custom" | "official";
  serverUrl: string;
  apiToken: string;
  deviceName: string;
  deviceId: string;
  managedLocal?: boolean;
}
