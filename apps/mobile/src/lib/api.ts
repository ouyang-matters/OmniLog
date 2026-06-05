import { ApiClient, type FetchLike, type ServerConfig } from "@omnilog/shared";
import { invoke } from "@tauri-apps/api/core";

interface RustHttpResponse {
  status: number;
  bodyBase64: string;
  contentType?: string | null;
}

function headerPairs(init?: HeadersInit): [string, string][] {
  const out: [string, string][] = [];
  new Headers(init).forEach((value, key) => out.push([key, value]));
  return out;
}

function u8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buffer;
}

function toResponse(r: RustHttpResponse): Response {
  const headers = new Headers();
  if (r.contentType) headers.set("content-type", r.contentType);
  return new Response(new Blob([base64ToBuffer(r.bodyBase64)]), {
    status: r.status,
    headers,
  });
}

export const rustFetch: FetchLike = async (url, init) => {
  const headers = headerPairs(init?.headers);

  if (init?.body instanceof FormData) {
    const fields: { name: string; value: string }[] = [];
    let file:
      | { name: string; fileName: string; mimeType: string; base64: string }
      | null = null;
    for (const [name, value] of init.body.entries()) {
      if (value instanceof Blob) {
        const buf = new Uint8Array(await value.arrayBuffer());
        file = {
          name,
          fileName: value instanceof File ? value.name : "file",
          mimeType: value.type || "application/octet-stream",
          base64: u8ToBase64(buf),
        };
      } else {
        fields.push({ name, value: String(value) });
      }
    }
    const cleanHeaders = headers.filter(([k]) => k.toLowerCase() !== "content-type");
    const resp = await invoke<RustHttpResponse>("http_multipart", {
      req: { url, headers: cleanHeaders, fields, file },
    });
    return toResponse(resp);
  }

  const body = typeof init?.body === "string" ? init.body : undefined;
  const resp = await invoke<RustHttpResponse>("http_fetch", {
    req: { method: init?.method ?? "GET", url, headers, body },
  });
  return toResponse(resp);
};

export function createApiClient(cfg: ServerConfig): ApiClient {
  return new ApiClient({
    baseUrl: cfg.serverUrl,
    token: cfg.apiToken,
    fetch: rustFetch,
  });
}

export async function testConnection(
  serverUrl: string,
  apiToken: string,
): Promise<{ ok: boolean; name: string; version: string }> {
  const client = new ApiClient({
    baseUrl: serverUrl,
    token: apiToken,
    fetch: rustFetch,
    timeoutMs: 8000,
  });
  return client.health();
}
