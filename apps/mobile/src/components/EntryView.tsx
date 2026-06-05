import { useRef, useEffect, useCallback } from "react";
import { useApp } from "../store/appStore";

export function EntryView() {
  const current = useApp((s) => s.current);
  const saveState = useApp((s) => s.saveState);
  const patchCurrent = useApp((s) => s.patchCurrent);
  const saveNow = useApp((s) => s.saveNow);
  const deleteEntry = useApp((s) => s.deleteEntry);
  const goBack = useApp((s) => s.goBack);

  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textRef.current && current) {
      textRef.current.value = current.contentText;
    }
  }, [current?.id]);

  const handleTextChange = useCallback(() => {
    const text = textRef.current?.value ?? "";
    patchCurrent({
      contentText: text,
      contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
    });
  }, [patchCurrent]);

  if (!current) {
    return (
      <div className="page centered">
        <p>No entry selected</p>
        <button className="btn btn-outline" onClick={goBack}>Back</button>
      </div>
    );
  }

  const handleDelete = async () => {
    if (confirm("Delete this entry?")) {
      await deleteEntry(current.id);
    }
  };

  return (
    <div className="page entry-view-page">
      <header className="mobile-header">
        <button className="btn-icon" onClick={goBack} aria-label="Back">
          &larr;
        </button>
        <span className="save-indicator">
          {saveState === "saving" && "Saving..."}
          {saveState === "saved" && "Saved"}
          {saveState === "offline" && "Offline"}
        </span>
        <div className="header-actions">
          <button className="btn-icon" onClick={saveNow} aria-label="Save">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M15 6.5V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h7.5L15 5.5Z" />
              <path d="M12 16v-5H6v5" />
              <path d="M6 2v4h5" />
            </svg>
          </button>
          <button className="btn-icon danger" onClick={handleDelete} aria-label="Delete">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 5h12M7 5V3h4v2M6 8v6M9 8v6M12 8v6M4 5l1 10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-10" />
            </svg>
          </button>
        </div>
      </header>

      <div className="editor-fields">
        <input
          className="title-input"
          type="text"
          value={current.title}
          onChange={(e) => patchCurrent({ title: e.target.value })}
          placeholder="Title"
        />
        <input
          className="date-input"
          type="date"
          value={current.date}
          onChange={(e) => patchCurrent({ date: e.target.value })}
        />
        <input
          className="tags-input"
          type="text"
          value={current.tags.join(", ")}
          onChange={(e) =>
            patchCurrent({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })
          }
          placeholder="Tags (comma separated)"
        />
      </div>

      <textarea
        ref={textRef}
        className="content-textarea"
        defaultValue={current.contentText}
        onChange={handleTextChange}
        placeholder="Start writing..."
      />
    </div>
  );
}
