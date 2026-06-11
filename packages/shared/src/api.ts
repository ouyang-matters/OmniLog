/**
 * Transport-agnostic API contract + a thin typed client. The client accepts an
 * injected `fetch` so the desktop app can pass either the browser `fetch` or a
 * Tauri HTTP-plugin fetch without this package depending on Tauri.
 */
import type {
  Asset,
  EntryVersion,
  Folder,
  HealthResponse,
  License,
  LoginResponse,
  Message,
  PublicUser,
  Role,
  ServerInfo,
  ServerSettings,
  Share,
  WorklogEntry,
} from "./types.js";
import type {
  CreateEntryInput,
  ExportInput,
  ExportResult,
  UpdateEntryInput,
} from "./schemas.js";

export const API_ROUTES = {
  health: "/health",
  entries: "/api/entries",
  entry: (id: string) => `/api/entries/${id}`,
  entryVersions: (id: string) => `/api/entries/${id}/versions`,
  entryRestore: (id: string) => `/api/entries/${id}/restore`,
  folders: "/api/folders",
  folder: (id: string) => `/api/folders/${id}`,
  folderShares: (id: string) => `/api/folders/${id}/shares`,
  folderShare: (id: string, userId: string) => `/api/folders/${id}/shares/${userId}`,
  settings: "/api/settings",
  login: "/api/auth/login",
  me: "/api/auth/me",
  changePassword: "/api/auth/change-password",
  users: "/api/users",
  user: (id: string) => `/api/users/${id}`,
  adminServerInfo: "/api/admin/server-info",
  license: "/api/auth/license",
  billingCheckout: "/api/billing/checkout",
  billingPortal: "/api/billing/portal",
  assetImage: "/api/assets/image",
  asset: (id: string) => `/api/assets/${id}`,
  search: "/api/search",
  export: "/api/export",
  messages: "/api/messages",
  message: (id: string) => `/api/messages/${id}`,
  messageRead: (id: string) => `/api/messages/${id}/read`,
  messagesReadAll: "/api/messages/read-all",
} as const;

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface ApiClientOptions {
  baseUrl: string;
  token: string;
  fetch?: FetchLike;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiClient {
  private baseUrl: string;
  private token: string;
  private fetchImpl: FetchLike;
  private timeoutMs: number;

  constructor(opts: ApiClientOptions) {
    // Normalize: drop a trailing slash so `${baseUrl}${route}` never doubles up.
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.fetchImpl =
      opts.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  private async request<T>(
    route: string,
    init: RequestInit = {},
    auth = true,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = new Headers(init.headers);
    if (auth) headers.set("Authorization", `Bearer ${this.token}`);
    if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${route}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
      const text = await res.text();
      const parsed = text ? safeJson(text) : undefined;
      if (!res.ok) {
        const msg =
          (parsed && typeof parsed === "object" && "error" in parsed
            ? String((parsed as { error: unknown }).error)
            : res.statusText) || `HTTP ${res.status}`;
        throw new ApiError(res.status, msg, parsed);
      }
      return parsed as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** GET /health - used by the "Test Connection" button. No auth required. */
  health(): Promise<HealthResponse> {
    return this.request<HealthResponse>(API_ROUTES.health, { method: "GET" }, false);
  }

  listEntries(params?: { tag?: string; folderId?: string | null }): Promise<WorklogEntry[]> {
    const q = new URLSearchParams();
    if (params?.tag) q.set("tag", params.tag);
    if (params?.folderId) q.set("folderId", params.folderId);
    const qs = q.toString() ? `?${q.toString()}` : "";
    return this.request<WorklogEntry[]>(`${API_ROUTES.entries}${qs}`, { method: "GET" });
  }

  listFolders(): Promise<Folder[]> {
    return this.request<Folder[]>(API_ROUTES.folders, { method: "GET" });
  }

  createFolder(input: { name: string; parentId?: string | null }): Promise<Folder> {
    return this.request<Folder>(API_ROUTES.folders, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateFolder(id: string, input: { name?: string; parentId?: string }): Promise<Folder> {
    return this.request<Folder>(API_ROUTES.folder(id), {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  deleteFolder(id: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(API_ROUTES.folder(id), { method: "DELETE" });
  }

  // --- Auth & users ---
  login(username: string, password: string): Promise<LoginResponse> {
    return this.request<LoginResponse>(
      API_ROUTES.login,
      { method: "POST", body: JSON.stringify({ username, password }) },
      false,
    );
  }

  me(): Promise<PublicUser> {
    return this.request<PublicUser>(API_ROUTES.me, { method: "GET" });
  }

  updateMe(input: { displayName?: string; avatarDataUrl?: string; email?: string }): Promise<PublicUser> {
    return this.request<PublicUser>(API_ROUTES.me, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  changePassword(input: { oldPassword: string; newPassword: string }): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(API_ROUTES.changePassword, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listUsers(): Promise<PublicUser[]> {
    return this.request<PublicUser[]>(API_ROUTES.users, { method: "GET" });
  }

  createUser(input: { username: string; password: string; role?: Role; displayName?: string; email?: string }): Promise<PublicUser> {
    return this.request<PublicUser>(API_ROUTES.users, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateUser(
    id: string,
    input: { role?: Role; password?: string; displayName?: string; email?: string },
  ): Promise<PublicUser> {
    return this.request<PublicUser>(API_ROUTES.user(id), {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  deleteUser(id: string): Promise<{ ok: boolean; username?: string }> {
    return this.request<{ ok: boolean; username?: string }>(API_ROUTES.user(id), {
      method: "DELETE",
    });
  }

  // --- Owner-only admin endpoints ---
  getServerInfo(): Promise<ServerInfo> {
    return this.request<ServerInfo>(API_ROUTES.adminServerInfo, { method: "GET" });
  }

  updateServerInfo(input: { corsOrigin?: string; publicUrl?: string }): Promise<{ ok: true; restartRequired: boolean }> {
    return this.request<{ ok: true; restartRequired: boolean }>(API_ROUTES.adminServerInfo, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  /**
   * Fetch the caller's license / entitlement. Implemented by the official
   * hosted service; self-hosted servers return 404 — callers should
   * treat that as "no license info available" (effectively free / self-host).
   */
  getLicense(): Promise<License> {
    return this.request<License>(API_ROUTES.license, { method: "GET" });
  }

  /**
   * Create a Stripe Checkout session for the given plan. The returned URL is
   * opened in the system browser; Stripe sends the user back to the server's
   * BILLING_RETURN_URL when they're done.
   */
  startCheckout(plan: "pro" | "team"): Promise<{ url: string }> {
    return this.request<{ url: string }>(API_ROUTES.billingCheckout, {
      method: "POST",
      body: JSON.stringify({ plan }),
    });
  }

  /**
   * Create a Customer-Portal session for the caller. The returned URL lets
   * the user manage their subscription (change plan, update card, cancel)
   * without leaving Stripe.
   */
  openCustomerPortal(): Promise<{ url: string }> {
    return this.request<{ url: string }>(API_ROUTES.billingPortal, {
      method: "POST",
    });
  }

  // --- Folder shares ---
  listShares(folderId: string): Promise<Share[]> {
    return this.request<Share[]>(API_ROUTES.folderShares(folderId), { method: "GET" });
  }

  createShare(folderId: string, input: { username: string; role: "viewer" | "editor" | "owner" }): Promise<Share> {
    return this.request<Share>(API_ROUTES.folderShares(folderId), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateShare(
    folderId: string,
    userId: string,
    input: { role: "viewer" | "editor" | "owner" },
  ): Promise<Share> {
    return this.request<Share>(API_ROUTES.folderShare(folderId, userId), {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  deleteShare(folderId: string, userId: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(API_ROUTES.folderShare(folderId, userId), {
      method: "DELETE",
    });
  }

  // --- Messages / notifications ---
  listMessages(): Promise<Message[]> {
    return this.request<Message[]>(API_ROUTES.messages, { method: "GET" });
  }

  markMessageRead(id: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(API_ROUTES.messageRead(id), { method: "POST" });
  }

  markAllMessagesRead(): Promise<{ ok: true; count: number }> {
    return this.request<{ ok: true; count: number }>(API_ROUTES.messagesReadAll, {
      method: "POST",
    });
  }

  deleteMessage(id: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(API_ROUTES.message(id), { method: "DELETE" });
  }

  getEntry(id: string): Promise<WorklogEntry> {
    return this.request<WorklogEntry>(API_ROUTES.entry(id), { method: "GET" });
  }

  createEntry(input: CreateEntryInput): Promise<WorklogEntry> {
    return this.request<WorklogEntry>(API_ROUTES.entries, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateEntry(id: string, input: UpdateEntryInput): Promise<WorklogEntry> {
    return this.request<WorklogEntry>(API_ROUTES.entry(id), {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  deleteEntry(id: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(API_ROUTES.entry(id), { method: "DELETE" });
  }

  search(q: string): Promise<WorklogEntry[]> {
    return this.request<WorklogEntry[]>(
      `${API_ROUTES.search}?q=${encodeURIComponent(q)}`,
      { method: "GET" },
    );
  }

  listVersions(entryId: string): Promise<EntryVersion[]> {
    return this.request<EntryVersion[]>(API_ROUTES.entryVersions(entryId), {
      method: "GET",
    });
  }

  restoreVersion(entryId: string, version: number): Promise<WorklogEntry> {
    return this.request<WorklogEntry>(API_ROUTES.entryRestore(entryId), {
      method: "POST",
      body: JSON.stringify({ version }),
    });
  }

  getSettings(): Promise<ServerSettings> {
    return this.request<ServerSettings>(API_ROUTES.settings, { method: "GET" });
  }

  updateSettings(input: Partial<ServerSettings>): Promise<ServerSettings> {
    return this.request<ServerSettings>(API_ROUTES.settings, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  /** Upload an image asset. `file` is a Blob/File from paste, drop, or picker. */
  async uploadImage(args: {
    entryId: string;
    file: Blob;
    fileName: string;
    caption?: string;
  }): Promise<Asset> {
    const form = new FormData();
    form.append("entryId", args.entryId);
    if (args.caption) form.append("caption", args.caption);
    form.append("file", args.file, args.fileName);
    return this.request<Asset>(API_ROUTES.assetImage, {
      method: "POST",
      body: form,
    });
  }

  /** Fetch an asset's binary (with auth) - returns a Blob the UI can objectURL. */
  async getAssetBlob(id: string): Promise<Blob> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${API_ROUTES.asset(id)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.token}` },
        signal: controller.signal,
      });
      if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
      return await res.blob();
    } finally {
      clearTimeout(timer);
    }
  }

  deleteAsset(id: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(API_ROUTES.asset(id), { method: "DELETE" });
  }

  export(input: ExportInput): Promise<ExportResult> {
    return this.request<ExportResult>(API_ROUTES.export, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
