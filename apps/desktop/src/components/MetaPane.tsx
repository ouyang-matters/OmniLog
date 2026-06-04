import { useMemo, useState } from "react";
import { useApp } from "../store/appStore";
import { HistoryModal } from "./HistoryModal";
import { FolderPicker } from "./FolderPicker";
import { isLocalId } from "../lib/drafts";

export function MetaPane() {
  const current = useApp((s) => s.current);
  const saveState = useApp((s) => s.saveState);
  const online = useApp((s) => s.online);
  const patchCurrent = useApp((s) => s.patchCurrent);
  const deleteEntry = useApp((s) => s.deleteEntry);
  const folders = useApp((s) => s.folders);
  const moveEntry = useApp((s) => s.moveEntry);
  const me = useApp((s) => s.me);

  const [tagInput, setTagInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showMove, setShowMove] = useState(false);

  const folderName = useMemo(() => {
    if (!current?.folderId) return "Root";
    return folders.find((f) => f._id === current.folderId)?.name ?? "(unknown folder)";
  }, [current?.folderId, folders]);

  if (!current) return null;

  const words = current.contentText.trim()
    ? current.contentText.trim().split(/\s+/).length
    : 0;
  const chars = current.contentText.length;

  function addTag() {
    const t = tagInput.trim().replace(/^#/, "");
    if (!t || current!.tags.includes(t)) {
      setTagInput("");
      return;
    }
    patchCurrent({ tags: [...current!.tags, t] });
    setTagInput("");
  }

  function removeTag(tag: string) {
    patchCurrent({ tags: current!.tags.filter((t) => t !== tag) });
  }

  const saveLabel: Record<string, string> = {
    idle: "All changes saved",
    saving: "Saving...",
    saved: "Saved",
    offline: "Saved locally (offline)",
    error: "Save error",
  };

  return (
    <aside className="meta-pane">
      <section className="meta-section">
        <label className="field">
          <span>Date</span>
          <input
            type="date"
            value={current.date}
            onChange={(e) => patchCurrent({ date: e.target.value })}
          />
        </label>
      </section>

      <section className="meta-section">
        <h4>Folder</h4>
        <div className="folder-row">
          <span className="folder-name-pill" title={folderName}>{folderName}</span>
          <button className="btn small" onClick={() => setShowMove(true)} title="Move to another folder">
            Move…
          </button>
        </div>
      </section>

      <section className="meta-section">
        <h4>Tags</h4>
        <div className="tag-list">
          {current.tags.map((t) => (
            <span key={t} className="tag-chip removable" onClick={() => removeTag(t)}>
              #{t} ✕
            </span>
          ))}
        </div>
        <input
          className="tag-input"
          placeholder="Add tag + Enter"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
        />
      </section>

      <section className="meta-section stats">
        <div><span className="muted">Words</span><strong>{words}</strong></div>
        <div><span className="muted">Characters</span><strong>{chars}</strong></div>
        <div>
          <span className="muted">Created</span>
          <strong>{current.dirty && current.id.startsWith("local:") ? "-" : formatDate(current.updatedAt)}</strong>
        </div>
        <div>
          <span className="muted">Updated</span>
          <strong>{formatDate(current.updatedAt)}</strong>
        </div>
      </section>

      <section className="meta-section">
        <div className={`save-state ${saveState}`}>
          {saveLabel[saveState] ?? ""}
          {!online && " - offline"}
        </div>
      </section>

      <section className="meta-section">
        <button
          className="btn block"
          disabled={isLocalId(current.id)}
          title={isLocalId(current.id) ? "Save to the server first" : "View version history"}
          onClick={() => setShowHistory(true)}
        >
          Version history
        </button>
      </section>

      <section className="meta-section">
        <button
          className="btn danger block"
          onClick={() => {
            if (confirm("Delete this entry?")) void deleteEntry(current.id);
          }}
        >
          Delete entry
        </button>
      </section>

      {showHistory && !isLocalId(current.id) && (
        <HistoryModal entryId={current.id} onClose={() => setShowHistory(false)} />
      )}

      {showMove && (
        <FolderPicker
          title="Move entry to…"
          folders={folders.filter((f) => {
            // Owners can move into any of their own folders; for shared folders
            // they need at least editor rights to write entries there.
            if (!f.myRole || f.myRole === "owner") return f.userId === (me?.id ?? f.userId);
            return f.myRole === "editor";
          })}
          currentId={current.folderId ?? null}
          onSelect={(folderId) => {
            setShowMove(false);
            void moveEntry(current.id, folderId);
          }}
          onCancel={() => setShowMove(false)}
        />
      )}
    </aside>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}
