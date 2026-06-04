import { useCallback, useState } from "react";
import { useApp } from "../store/appStore";
import { ModeSwitcher } from "./editor/ModeSwitcher";
import { RichEditor } from "./editor/RichEditor";
import { LatexEditor } from "./editor/LatexEditor";
import { MarkdownEditor } from "./editor/MarkdownEditor";

/**
 * Editor shell. Always renders the title input + mode switcher; dispatches the
 * actual editor body based on the current entry's `mode`. Rich = TipTap;
 * latex/markdown = plain-text source editor with live preview.
 */
export function EditorPane() {
  const current = useApp((s) => s.current);
  const patchCurrent = useApp((s) => s.patchCurrent);
  const setMode = useApp((s) => s.setMode);
  const [title, setTitle] = useState(current?.title ?? "");

  const onTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      patchCurrent({ title: value });
    },
    [patchCurrent],
  );

  if (!current) return null;

  const mode = current.mode ?? "rich";

  function onChangeMode(next: "rich" | "latex" | "markdown") {
    if (next === mode) return;
    // Soft confirm when leaving rich mode with non-trivial content — we wipe
    // the ProseMirror tree so the alternate editor has a clean slate.
    if (mode === "rich" && next !== "rich" && (current?.contentText.trim().length ?? 0) > 0) {
      const ok = window.confirm(
        `Switch to ${next}? The rich text will be discarded (the plain-text projection stays in place).`,
      );
      if (!ok) return;
    }
    setMode(next);
  }

  return (
    <div className="editor-root">
      <div className="editor-mode-row">
        <ModeSwitcher mode={mode} onChange={onChangeMode} />
      </div>

      <input
        className="title-input"
        placeholder="Untitled"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
      />

      {mode === "rich" && <RichEditor key={current.id} draft={current} />}
      {mode === "latex" && <LatexEditor key={`${current.id}:latex`} draft={current} />}
      {mode === "markdown" && <MarkdownEditor key={`${current.id}:md`} draft={current} />}
    </div>
  );
}
