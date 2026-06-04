import { useMemo, useState } from "react";
import type { Folder } from "@omnilog/shared";
import { useApp } from "./context";
import { Icon } from "./icons/index";
import { ShareModal } from "./ShareModal";
import { FolderPicker, descendantsOf } from "./FolderPicker";

type MovePickerState =
  | { kind: "folder"; folder: Folder }
  | { kind: "entry"; entryId: string; title: string };

export function Sidebar() {
  const folders = useApp((s) => s.folders);
  const currentFolderId = useApp((s) => s.currentFolderId);
  const enterFolder = useApp((s) => s.enterFolder);
  const createFolder = useApp((s) => s.createFolder);
  const renameFolder = useApp((s) => s.renameFolder);
  const moveFolder = useApp((s) => s.moveFolder);
  const deleteFolder = useApp((s) => s.deleteFolder);
  const moveEntry = useApp((s) => s.moveEntry);
  const entries = useApp((s) => s.entries);
  const currentId = useApp((s) => s.currentId);
  const search = useApp((s) => s.search);
  const setSearch = useApp((s) => s.setSearch);
  const selectEntry = useApp((s) => s.selectEntry);
  const createEntry = useApp((s) => s.createEntry);
  const me = useApp((s) => s.me);

  const byId = useMemo(() => new Map(folders.map((f) => [f._id, f])), [folders]);
  const searching = search.trim().length > 0;
  const [showShare, setShowShare] = useState(false);
  const [picker, setPicker] = useState<MovePickerState | null>(null);
  const currentFolder = currentFolderId ? byId.get(currentFolderId) : undefined;
  const currentIsShared = currentFolder ? isShared(currentFolder, me?.id) : false;
  const canShareCurrent = currentFolder ? !isShared(currentFolder, me?.id) : false;
  const canManageCurrent = currentFolder ? !isShared(currentFolder, me?.id) : false;

  const crumbs = useMemo(() => {
    const path = [] as { _id: string; name: string }[];
    let id: string | null | undefined = currentFolderId;
    while (id) {
      const f = byId.get(id);
      if (!f) break;
      path.unshift(f);
      id = f.parentId ?? null;
    }
    return path;
  }, [currentFolderId, byId]);

  const subfolders = useMemo(
    () => folders.filter((f) => (f.parentId ?? null) === currentFolderId),
    [folders, currentFolderId],
  );

  async function onNewFolder() {
    const name = window.prompt("Folder name");
    if (name && name.trim()) await createFolder(name.trim(), currentFolderId);
  }

  async function onRenameFolder(f: Folder) {
    const next = window.prompt(`Rename "${f.name}" to:`, f.name);
    if (!next || !next.trim() || next.trim() === f.name) return;
    try {
      await renameFolder(f._id, next.trim());
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed to rename folder.");
    }
  }

  async function onMoveFolder(parentId: string | null) {
    if (!picker || picker.kind !== "folder") return;
    const id = picker.folder._id;
    setPicker(null);
    if (parentId === (picker.folder.parentId ?? null)) return;
    try {
      await moveFolder(id, parentId);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed to move folder.");
    }
  }

  async function onMoveEntry(folderId: string | null) {
    if (!picker || picker.kind !== "entry") return;
    const id = picker.entryId;
    setPicker(null);
    try {
      await moveEntry(id, folderId);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed to move entry.");
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <input
          className="search"
          type="search"
          placeholder="Search all..."
          value={search}
          onChange={(e) => void setSearch(e.target.value)}
        />
        <button className="btn primary new-btn" onClick={() => void createEntry()}>
          + New
        </button>
      </div>

      {!searching && (
        <div className="breadcrumb">
          <button className="crumb" onClick={() => void enterFolder(null)}>
            Home
          </button>
          {crumbs.map((f) => (
            <span key={f._id} className="crumb-wrap">
              <Icon name="chevronRight" size={12} />
              <button className="crumb" onClick={() => void enterFolder(f._id)}>
                {f.name}
              </button>
            </span>
          ))}
          {currentIsShared && (
            <span
              className="badge shared-badge"
              title={
                currentFolder?.ownerUsername
                  ? `Shared by ${currentFolder.ownerUsername} (${currentFolder.myRole ?? "viewer"})`
                  : "Shared with you"
              }
            >
              <Icon name="folderShared" size={11} /> shared
            </span>
          )}
          {canManageCurrent && currentFolder && (
            <>
              <button
                className="icon-btn"
                title="Rename current folder"
                onClick={() => void onRenameFolder(currentFolder)}
              >
                <Icon name="edit" size={13} />
              </button>
              <button
                className="icon-btn"
                title="Move current folder"
                onClick={() => setPicker({ kind: "folder", folder: currentFolder })}
              >
                <Icon name="move" size={13} />
              </button>
            </>
          )}
          {canShareCurrent && (
            <button className="icon-btn" title="Share folder" onClick={() => setShowShare(true)}>
              <Icon name="folderShared" size={15} />
            </button>
          )}
          <button className="icon-btn folder-add" title="New folder" onClick={onNewFolder}>
            <Icon name="folderPlus" size={15} />
          </button>
        </div>
      )}

      {showShare && currentFolder && (
        <ShareModal
          folderId={currentFolder._id}
          folderName={currentFolder.name}
          onClose={() => setShowShare(false)}
        />
      )}

      {picker?.kind === "folder" && (
        <FolderPicker
          title={`Move "${picker.folder.name}" to…`}
          folders={folders.filter((f) => !isShared(f, me?.id))}
          currentId={picker.folder.parentId ?? null}
          exclude={descendantsOf(folders, picker.folder._id)}
          onSelect={(parentId) => void onMoveFolder(parentId)}
          onCancel={() => setPicker(null)}
        />
      )}
      {picker?.kind === "entry" && (
        <FolderPicker
          title={`Move "${picker.title || "(untitled)"}" to…`}
          folders={folders.filter((f) => !isShared(f, me?.id) || f.myRole === "editor" || f.myRole === "owner")}
          currentId={null}
          onSelect={(folderId) => void onMoveEntry(folderId)}
          onCancel={() => setPicker(null)}
        />
      )}

      <ul className="entry-list">
        {!searching &&
          subfolders.map((f) => {
            const shared = isShared(f, me?.id);
            return (
              <li key={f._id} className="folder-item" onClick={() => void enterFolder(f._id)}>
                <Icon name={shared ? "folderShared" : "folder"} size={16} />
                <span className="folder-name">{f.name}</span>
                {shared && f.ownerUsername && (
                  <span className="muted small" title={`Shared by ${f.ownerUsername}`}>
                    @{f.ownerUsername}
                  </span>
                )}
                {!shared && (
                  <>
                    <button
                      className="folder-del"
                      title="Rename folder"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onRenameFolder(f);
                      }}
                    >
                      <Icon name="edit" size={12} />
                    </button>
                    <button
                      className="folder-del"
                      title="Move folder"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPicker({ kind: "folder", folder: f });
                      }}
                    >
                      <Icon name="move" size={12} />
                    </button>
                    <button
                      className="folder-del"
                      title="Delete folder"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete folder "${f.name}"?`)) void deleteFolder(f._id);
                      }}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </>
                )}
              </li>
            );
          })}

        {entries.length === 0 && (searching || subfolders.length === 0) && (
          <li className="muted entry-empty">
            {searching ? "No matches." : "Empty. Create a doc or folder."}
          </li>
        )}

        {entries.map((e) => (
          <li
            key={e.id}
            className={`entry-item ${e.id === currentId ? "active" : ""}`}
            onClick={() => void selectEntry(e.id)}
          >
            <div className="entry-row">
              <div className="entry-title">
                {e.title || "(untitled)"}
                {e.dirty && <span className="dot dirty" title="Unsaved locally" />}
              </div>
              <button
                className="entry-move"
                title="Move to folder"
                onClick={(event) => {
                  event.stopPropagation();
                  setPicker({ kind: "entry", entryId: e.id, title: e.title });
                }}
              >
                <Icon name="move" size={12} />
              </button>
            </div>
            <div className="entry-sub muted">
              {e.date}
              {e.tags.length > 0 && ` - ${e.tags.map((t) => `#${t}`).join(" ")}`}
            </div>
            <div className="entry-preview muted">{e.contentText.slice(0, 80) || "-"}</div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * A folder is "shared with me" when its owner is someone else. Backed by the
 * `myRole`/`ownerUsername` fields the server attaches to the list response;
 * falls back to comparing `userId` for older payloads.
 */
function isShared(
  f: { userId: string; myRole?: string; ownerUsername?: string },
  meId?: string,
): boolean {
  if (f.myRole && f.myRole !== "owner") return true;
  if (f.ownerUsername) return true;
  return meId !== undefined && f.userId !== meId;
}
