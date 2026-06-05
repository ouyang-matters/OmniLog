import { useCallback } from "react";
import { useApp } from "../store/appStore";

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "...";
}

export function EntryList() {
  const entries = useApp((s) => s.entries);
  const online = useApp((s) => s.online);
  const search = useApp((s) => s.search);
  const messages = useApp((s) => s.messages);
  const folders = useApp((s) => s.folders);
  const currentFolderId = useApp((s) => s.currentFolderId);
  const selectEntry = useApp((s) => s.selectEntry);
  const createEntry = useApp((s) => s.createEntry);
  const setSearch = useApp((s) => s.setSearch);
  const navigate = useApp((s) => s.navigate);
  const enterFolder = useApp((s) => s.enterFolder);
  const refresh = useApp((s) => s.refresh);

  const unreadCount = messages.filter((m) => !m.readAt).length;
  const childFolders = folders.filter((f) => (f.parentId ?? null) === currentFolderId);
  const currentFolder = currentFolderId ? folders.find((f) => f._id === currentFolderId) : null;

  const pullToRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  return (
    <div className="page entry-list-page">
      <header className="mobile-header">
        {currentFolderId ? (
          <button className="btn-icon" onClick={() => enterFolder(null)} aria-label="Back">
            &larr;
          </button>
        ) : (
          <div className="header-spacer" />
        )}
        <h1 className="header-title">
          {currentFolder?.name ?? "OmniLog"}
        </h1>
        <div className="header-actions">
          <button
            className="btn-icon"
            onClick={() => navigate("settings")}
            aria-label="Settings"
          >
            {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="10" cy="10" r="3" />
              <path d="M10 1v2m0 14v2M1 10h2m14 0h2M3.5 3.5l1.4 1.4m10.2 10.2l1.4 1.4M16.5 3.5l-1.4 1.4M4.9 14.1l-1.4 1.4" />
            </svg>
          </button>
        </div>
      </header>

      <div className="search-bar">
        <input
          type="search"
          placeholder="Search entries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {!online && (
        <div className="offline-banner" onClick={pullToRefresh}>
          Offline — tap to retry
        </div>
      )}

      <div className="list-content">
        {childFolders.length > 0 && !search && (
          <div className="folder-chips">
            {childFolders.map((f) => (
              <button
                key={f._id}
                className="folder-chip"
                onClick={() => enterFolder(f._id)}
              >
                <span className="folder-icon">📁</span> {f.name}
              </button>
            ))}
          </div>
        )}

        {entries.length === 0 ? (
          <div className="empty-state">
            <p>{search ? "No results" : "No entries yet"}</p>
          </div>
        ) : (
          <ul className="entry-items">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="entry-item"
                onClick={() => selectEntry(entry.id)}
              >
                <div className="entry-item-header">
                  <span className="entry-title">
                    {entry.title || "Untitled"}
                  </span>
                  <span className="entry-date">{formatDate(entry.updatedAt)}</span>
                </div>
                <div className="entry-preview">
                  {truncate(entry.contentText, 100)}
                </div>
                {entry.tags.length > 0 && (
                  <div className="entry-tags">
                    {entry.tags.map((t) => (
                      <span key={t} className="tag">{t}</span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button className="fab" onClick={createEntry} aria-label="New entry">
        +
      </button>
    </div>
  );
}
