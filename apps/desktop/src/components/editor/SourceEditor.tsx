import { useEffect, useRef, useState } from "react";

type View = "edit" | "split" | "preview";

interface Props {
  value: string;
  placeholder?: string;
  /** Rendered HTML for the preview pane. */
  previewHtml: string;
  /** Re-focuses the textarea when this changes (entry switch). */
  resetKey: string;
  onChange: (next: string) => void;
}

/**
 * Shared shell for the Markdown / LaTeX source editors. Offers a clean
 * Edit / Both / Preview view toggle instead of a fixed split of two boxes.
 */
export function SourceEditor({ value, placeholder, previewHtml, resetKey, onChange }: Props) {
  const [view, setView] = useState<View>("split");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (view !== "preview") taRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    onChange(value.slice(0, start) + "  " + value.slice(end));
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 2;
    });
  }

  return (
    <div className="source-editor">
      <div className="source-toolbar">
        <div className="segmented source-view" role="tablist" aria-label="View">
          <button
            type="button"
            className={view === "edit" ? "active" : ""}
            onClick={() => setView("edit")}
          >
            Edit
          </button>
          <button
            type="button"
            className={view === "split" ? "active" : ""}
            onClick={() => setView("split")}
          >
            Both
          </button>
          <button
            type="button"
            className={view === "preview" ? "active" : ""}
            onClick={() => setView("preview")}
          >
            Preview
          </button>
        </div>
      </div>

      <div className={`source-body view-${view}`}>
        {view !== "preview" && (
          <textarea
            ref={taRef}
            className="source-input"
            value={value}
            spellCheck={false}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
        )}
        {view !== "edit" && (
          <div
            className="source-preview prosemirror-host"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
      </div>
    </div>
  );
}
