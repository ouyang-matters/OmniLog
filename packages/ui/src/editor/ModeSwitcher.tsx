import type { EntryMode } from "@omnilog/shared";

interface Props {
  mode: EntryMode;
  onChange: (mode: EntryMode) => void;
}

/**
 * Three-way segmented control for the editor mode. Used at the top of the
 * editor pane above whichever concrete editor is currently mounted.
 */
export function ModeSwitcher({ mode, onChange }: Props) {
  return (
    <div className="segmented mode-switcher" role="tablist" aria-label="Editor mode">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "rich"}
        className={mode === "rich" ? "active" : ""}
        title="Rich text (TipTap)"
        onClick={() => onChange("rich")}
      >
        Rich
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "markdown"}
        className={mode === "markdown" ? "active" : ""}
        title="Markdown source"
        onClick={() => onChange("markdown")}
      >
        Markdown
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "latex"}
        className={mode === "latex" ? "active" : ""}
        title="LaTeX source"
        onClick={() => onChange("latex")}
      >
        LaTeX
      </button>
    </div>
  );
}
