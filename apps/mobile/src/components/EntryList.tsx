import { useCallback, useState } from "react";
import { useApp } from "../store/appStore";
import { ActionSheet, ConfirmSheet, FolderPickerSheet, PromptSheet } from "./ui";
import { Icon } from "./icons";

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "...";
}

type ItemRef = { kind: "entry" | "folder"; id: string; name: string };
type PromptState =
  | { mode: "new-folder" }
  | { mode: "rename-folder"; id: string; initial: string }
  | { mode: "rename-entry"; id: string; initial: string };

export function EntryList() {
  const entries = useApp((s) => s.entries);
  const online = useApp((s) => s.online);
  const search = useApp((s) => s.search);
  const messages = useApp((s) => s.messages);
  const folders = useApp((s) => s.folders);
  const currentFolderId = useApp((s) => s.currentFolderId);
  const selectEntry = useApp((s) => s.selectEntry);
  const createEntry = useApp((s) => s.createEntry);
  const createFolder = useApp((s) => s.createFolder);
  const renameFolder = useApp((s) => s.renameFolder);
  const moveFolder = useApp((s) => s.moveFolder);
  const deleteFolder = useApp((s) => s.deleteFolder);
  const renameEntry = useApp((s) => s.renameEntry);
  const moveEntry = useApp((s) => s.moveEntry);
  const deleteEntry = useApp((s) => s.deleteEntry);
  const setSearch = useApp((s) => s.setSearch);
  const navigate = useApp((s) => s.navigate);
  const enterFolder = useApp((s) => s.enterFolder);
  const refresh = useApp((s) => s.refresh);

  const [fabOpen, setFabOpen] = useState(false);
  const [menu, setMenu] = useState<ItemRef | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [confirm, setConfirm] = useState<ItemRef | null>(null);
  const [move, setMove] = useState<ItemRef | null>(null);

  const unreadCount = messages.filter((m) => !m.readAt).length;
  const childFolders = folders.filter((f) => (f.parentId ?? null) === currentFolderId);
  const currentFolder = currentFolderId ? folders.find((f) => f._id === currentFolderId) : null;

  const pullToRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  function openMenu(ref: ItemRef, e: React.MouseEvent) {
    e.stopPropagation();
    setMenu(ref);
  }

  async function onPromptSubmit(value: string) {
    const p = prompt;
    setPrompt(null);
    if (!p) return;
    if (p.mode === "new-folder") await createFolder(value, currentFolderId);
    else if (p.mode === "rename-folder") await renameFolder(p.id, value);
    else if (p.mode === "rename-entry") await renameEntry(p.id, value);
  }

  async function onConfirmDelete() {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === "folder") await deleteFolder(c.id);
    else await deleteEntry(c.id);
  }

  async function onMovePick(target: string | null) {
    const m = move;
    setMove(null);
    if (!m) return;
    if (m.kind === "folder") await moveFolder(m.id, target);
    else await moveEntry(m.id, target);
  }

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
        <h1 className="header-title">{currentFolder?.name ?? "OmniLog"}</h1>
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
          <div className="folder-list">
            {childFolders.map((f) => (
              <div key={f._id} className="folder-row" onClick={() => enterFolder(f._id)}>
                <span className="folder-icon"><Icon name="folder" size={20} /></span>
                <span className="folder-name">{f.name}</span>
                <button
                  className="row-menu-btn"
                  aria-label="Folder menu"
                  onClick={(e) => openMenu({ kind: "folder", id: f._id, name: f.name }, e)}
                >
                  ⋯
                </button>
              </div>
            ))}
          </div>
        )}

        {entries.length === 0 && childFolders.length === 0 ? (
          <div className="empty-state">
            <p>{search ? "No results" : "No entries yet"}</p>
          </div>
        ) : (
          <ul className="entry-items">
            {entries.map((entry) => (
              <li key={entry.id} className="entry-item" onClick={() => selectEntry(entry.id)}>
                <div className="entry-item-header">
                  <span className="entry-title">{entry.title || "Untitled"}</span>
                  <button
                    className="row-menu-btn"
                    aria-label="Entry menu"
                    onClick={(e) =>
                      openMenu({ kind: "entry", id: entry.id, name: entry.title || "Untitled" }, e)
                    }
                  >
                    ⋯
                  </button>
                </div>
                <div className="entry-preview">{truncate(entry.contentText, 100)}</div>
                <div className="entry-item-footer">
                  {entry.tags.length > 0 && (
                    <div className="entry-tags">
                      {entry.tags.map((t) => (
                        <span key={t} className="tag">{t}</span>
                      ))}
                    </div>
                  )}
                  <span className="entry-date">{formatDate(entry.updatedAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button className="fab" onClick={() => setFabOpen(true)} aria-label="Create">
        +
      </button>

      {/* + menu: note or folder */}
      <ActionSheet
        open={fabOpen}
        onClose={() => setFabOpen(false)}
        title="Create"
        actions={[
          { label: "New note", icon: <Icon name="note" />, onPick: () => void createEntry() },
          { label: "New folder", icon: <Icon name="folder" />, onPick: () => setPrompt({ mode: "new-folder" }) },
        ]}
      />

      {/* Per-item menu: rename / move / delete */}
      <ActionSheet
        open={menu !== null}
        onClose={() => setMenu(null)}
        title={menu?.name}
        actions={
          menu
            ? [
                {
                  label: "Rename",
                  icon: <Icon name="rename" />,
                  onPick: () =>
                    setPrompt(
                      menu.kind === "folder"
                        ? { mode: "rename-folder", id: menu.id, initial: menu.name }
                        : { mode: "rename-entry", id: menu.id, initial: menu.name },
                    ),
                },
                { label: "Move", icon: <Icon name="move" />, onPick: () => setMove(menu) },
                { label: "Delete", icon: <Icon name="trash" />, danger: true, onPick: () => setConfirm(menu) },
              ]
            : []
        }
      />

      <PromptSheet
        open={prompt !== null}
        title={
          prompt?.mode === "new-folder"
            ? "New folder"
            : prompt?.mode === "rename-folder"
              ? "Rename folder"
              : "Rename note"
        }
        label="Name"
        placeholder={prompt?.mode === "new-folder" ? "Folder name" : undefined}
        initial={prompt && prompt.mode !== "new-folder" ? prompt.initial : ""}
        confirmText={prompt?.mode === "new-folder" ? "Create" : "Save"}
        onCancel={() => setPrompt(null)}
        onSubmit={onPromptSubmit}
      />

      <FolderPickerSheet
        open={move !== null}
        title="Move to"
        folders={folders}
        excludeId={move?.kind === "folder" ? move.id : undefined}
        onCancel={() => setMove(null)}
        onPick={onMovePick}
      />

      <ConfirmSheet
        open={confirm !== null}
        title={confirm?.kind === "folder" ? "Delete folder?" : "Delete note?"}
        message={
          confirm?.kind === "folder"
            ? `"${confirm?.name}" will be deleted. Notes inside move to the parent.`
            : `"${confirm?.name}" will be permanently deleted.`
        }
        confirmText="Delete"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={onConfirmDelete}
      />
    </div>
  );
}
