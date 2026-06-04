import { useEffect, useMemo, useRef } from "react";
import type { Message } from "@omnilog/shared";
import { useApp } from "../store/appStore";
import { Icon } from "../assets/icons";

interface Props {
  onClose: () => void;
}

/**
 * Notifications drop-down anchored under the topbar bell. Clicking outside or
 * pressing Escape closes it.
 */
export function MessagesPanel({ onClose }: Props) {
  const messages = useApp((s) => s.messages);
  const loadMessages = useApp((s) => s.loadMessages);
  const markMessageRead = useApp((s) => s.markMessageRead);
  const markAllMessagesRead = useApp((s) => s.markAllMessagesRead);
  const deleteMessage = useApp((s) => s.deleteMessage);
  const enterFolder = useApp((s) => s.enterFolder);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      // The bell button lives outside this panel — ignore clicks on it so
      // toggling doesn't close-then-reopen on the same gesture.
      const onBell = (target as HTMLElement | null)?.closest?.(".bell-wrap");
      if (ref.current && !ref.current.contains(target) && !onBell) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const hasUnread = useMemo(() => messages.some((m) => !m.readAt), [messages]);

  async function onOpen(m: Message) {
    if (!m.readAt) await markMessageRead(m._id);
    if (m.linkFolderId) {
      await enterFolder(m.linkFolderId);
      onClose();
    }
  }

  return (
    <div className="messages-panel" ref={ref} role="dialog" aria-label="Notifications">
      <header className="messages-head">
        <strong>Notifications</strong>
        <div className="messages-head-actions">
          {hasUnread && (
            <button
              className="btn small ghost"
              onClick={() => void markAllMessagesRead()}
              title="Mark all read"
            >
              Mark all read
            </button>
          )}
          <button className="icon-btn small" onClick={onClose} title="Close">
            <Icon name="close" size={12} />
          </button>
        </div>
      </header>

      <ul className="messages-list">
        {messages.length === 0 && (
          <li className="muted messages-empty">No notifications yet.</li>
        )}
        {messages.map((m) => (
          <li
            key={m._id}
            className={`message-item ${m.readAt ? "read" : "unread"}`}
            onClick={() => void onOpen(m)}
          >
            <div className="message-body">
              <div className="message-title">
                {!m.readAt && <span className="dot dirty" aria-label="Unread" />}
                <strong>{m.title}</strong>
              </div>
              <div className="muted small">{m.body}</div>
              <div className="muted small message-time">{formatTime(m.createdAt)}</div>
            </div>
            <button
              className="icon-btn small"
              title="Dismiss"
              onClick={(e) => {
                e.stopPropagation();
                void deleteMessage(m._id);
              }}
            >
              <Icon name="trash" size={12} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604_800) return `${Math.floor(diff / 86_400)}d ago`;
  return d.toLocaleDateString();
}
