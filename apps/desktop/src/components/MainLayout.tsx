import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "./Sidebar";
import { EditorPane } from "./EditorPane";
import { MetaPane } from "./MetaPane";
import { MessagesPanel } from "./MessagesPanel";
import { AvatarFrame } from "./settings/ProfileTab";
import { ServerSwitcher } from "./ServerSwitcher";
import { useApp } from "../store/appStore";
import { Icon } from "../assets/icons";

const MESSAGE_POLL_MS = 60_000;

export function MainLayout() {
  const online = useApp((s) => s.online);
  const current = useApp((s) => s.current);
  const theme = useApp((s) => s.theme);
  const editorEpoch = useApp((s) => s.editorEpoch);
  const toggleTheme = useApp((s) => s.toggleTheme);
  const reconnect = useApp((s) => s.reconnect);
  const messages = useApp((s) => s.messages);
  const loadMessages = useApp((s) => s.loadMessages);
  const openSettings = useApp((s) => s.openSettings);
  const me = useApp((s) => s.me);
  const [showMessages, setShowMessages] = useState(false);

  const unread = useMemo(
    () => messages.reduce((n, m) => (m.readAt ? n : n + 1), 0),
    [messages],
  );

  // Light background polling so notifications surface without WebSockets.
  useEffect(() => {
    if (!online) return;
    const id = window.setInterval(() => {
      void loadMessages();
    }, MESSAGE_POLL_MS);
    return () => window.clearInterval(id);
  }, [online, loadMessages]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <span className="brand">OmniLog</span>
          <ServerSwitcher />
        </div>
        <div className="topbar-right">
          {!online && (
            <button className="status-pill offline" onClick={() => void reconnect()}>
              Offline - working locally - Retry
            </button>
          )}
          {online && <span className="status-pill online">Online</span>}
          <div className="bell-wrap">
            <button
              className="icon-btn"
              onClick={() => setShowMessages((v) => !v)}
              title="Notifications"
              aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
            >
              <Icon name="bell" size={15} />
              {unread > 0 && <span className="bell-badge">{unread > 99 ? "99+" : unread}</span>}
            </button>
            {showMessages && <MessagesPanel onClose={() => setShowMessages(false)} />}
          </div>
          <button className="icon-btn" onClick={() => void toggleTheme()} title="Toggle theme">
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <button
            className="topbar-avatar"
            onClick={openSettings}
            title={me ? `Signed in as ${me.displayName || me.username} — open settings` : "Settings"}
            aria-label="Open settings"
          >
            <AvatarFrame
              src={me?.avatarDataUrl ?? null}
              fallback={me?.displayName || me?.username || "?"}
              size={26}
            />
          </button>
        </div>
      </header>

      <div className="panes">
        <Sidebar />
        <main className="editor-pane">
          {current ? (
            <EditorPane key={`${current.id}:${editorEpoch}`} />
          ) : (
            <div className="empty-editor muted">
              Select an entry or create a new one to start writing.
            </div>
          )}
        </main>
        {current && <MetaPane />}
      </div>

    </div>
  );
}
