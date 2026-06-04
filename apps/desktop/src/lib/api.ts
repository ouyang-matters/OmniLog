import { ApiClient, type FetchLike } from "@omnilog/shared";
import { invoke } from "@tauri-apps/api/core";

/**
 * HTTP transport that runs in Rust (reqwest) via Tauri commands rather than in
 * the webview. This avoids CORS, Chromium private-network blocking, and HTTP
 * plugin URL-scope issues entirely. We expose it as a `fetch`-compatible
 * function so the shared `ApiClient` can use it unchanged.
 */

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

/** A fetch implementation backed by the Rust http_fetch / http_multipart commands. */
export const rustFetch: FetchLike = async (url, init) => {
  const headers = headerPairs(init?.headers);

  // Multipart (image upload): pull out text fields and the file blob.
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
    // Authorization is sent as a header; drop any content-type so reqwest sets
    // the multipart boundary itself.
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

/**
 * Probe a server with the given URL/token without persisting anything.
 * Returns the health payload on success; throws on failure.
 */
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
