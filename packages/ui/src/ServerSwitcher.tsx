import { useEffect, useRef, useState } from "react";
import type { ServerConnection } from "@omnilog/shared";
import { useApp } from "./context";
import { Icon } from "./icons/index";

/**
 * Topbar dropdown that shows the active server and lets the user switch
 * between saved connections. "Add new…" jumps into the in-app setup flow
 * (Settings → Connections).
 */
export function ServerSwitcher() {
  const connections = useApp((s) => s.connections);
  const activeId = useApp((s) => s.activeConnectionId);
  const switchConnection = useApp((s) => s.switchConnection);
  const openSettings = useApp((s) => s.openSettings);
  const online = useApp((s) => s.online);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = connections.find((c) => c.id === activeId) ?? null;

  return (
    <div className="server-switcher" ref={wrapRef}>
      <button
        className="server-chip"
        title={active ? `${active.name} — ${active.serverUrl}` : "No server selected"}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={`server-dot ${online ? "ok" : "off"}`} aria-hidden="true" />
        <span className="server-name">{active?.name ?? "No server"}</span>
        <KindBadge kind={active?.kind ?? "self-hosted"} />
        <Icon name="chevronRight" size={11} />
      </button>

      {open && (
        <div className="server-menu" role="menu">
          <div className="server-menu-head muted small">Saved servers</div>
          {connections.length === 0 && (
            <div className="server-menu-empty muted small">No connections yet.</div>
          )}
          {connections.map((c) => (
            <button
              key={c.id}
              className={`server-menu-item ${c.id === activeId ? "active" : ""}`}
              onClick={async () => {
                setOpen(false);
                if (c.id !== activeId) {
                  try {
                    await switchConnection(c.id);
                  } catch (e) {
                    window.alert(e instanceof Error ? e.message : "Failed to switch server.");
                  }
                }
              }}
            >
              <KindBadge kind={c.kind} />
              <div className="server-menu-main">
                <div className="server-menu-name">{c.name}</div>
                <div className="muted small server-menu-url">{c.serverUrl}</div>
              </div>
              {c.id === activeId && <span className="muted small">active</span>}
            </button>
          ))}
          <div className="server-menu-foot">
            <button
              className="btn small block"
              onClick={() => {
                setOpen(false);
                openSettings();
                useApp.setState({ settingsTab: "connections" });
              }}
            >
              Manage connections…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function KindBadge({ kind }: { kind: ServerConnection["kind"] }) {
  const labels: Record<ServerConnection["kind"], { text: string; cls: string }> = {
    "local-embedded": { text: "local", cls: "kind-local" },
    "self-hosted": { text: "self", cls: "kind-self" },
    "official": { text: "official", cls: "kind-official" },
  };
  const { text, cls } = labels[kind];
  return <span className={`kind-badge ${cls}`}>{text}</span>;
}
