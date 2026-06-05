import { useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";

interface Props {
  initialLatex: string;
  /** Block (display) formula vs inline. Block gets a multi-line input. */
  display?: boolean;
  /** Position relative to the editor host (px). null = center fallback. */
  anchor: { left: number; top: number } | null;
  onSubmit: (latex: string) => void;
  onClose: () => void;
}

/**
 * Floating in-place editor for a formula, anchored at its node. Live KaTeX
 * preview as you type. Used for BOTH inline and block math so inserting a
 * formula never opens a modal dialog — it becomes an editable formula right in
 * the document. Inline: Enter confirms. Block: Ctrl/Cmd+Enter confirms (Enter
 * inserts a newline). Esc closes; click-away saves.
 */
export function InlineMathPopover({ initialLatex, display = false, anchor, onSubmit, onClose }: Props) {
  const [latex, setLatex] = useState(initialLatex);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLatex(initialLatex);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [initialLatex]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        onSubmit(latex);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [latex, onSubmit, onClose]);

  const previewHtml = useMemo(() => {
    if (!latex.trim()) return "";
    try {
      return katex.renderToString(latex, {
        displayMode: display,
        throwOnError: false,
        errorColor: "#e5484d",
      });
    } catch {
      return "";
    }
  }, [latex, display]);

  const style: React.CSSProperties = anchor
    ? { left: anchor.left, top: anchor.top }
    : { left: "50%", top: 80, transform: "translateX(-50%)" };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (!display || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSubmit(latex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div ref={popRef} className={`inline-math-popover ${display ? "block" : ""}`} style={style}>
      {display ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          className="inline-math-input"
          spellCheck={false}
          rows={3}
          value={latex}
          placeholder="LaTeX, e.g. \\int_0^1 x\\,dx"
          onChange={(e) => setLatex(e.target.value)}
          onKeyDown={onKeyDown}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          className="inline-math-input"
          spellCheck={false}
          value={latex}
          placeholder="LaTeX, e.g. \\frac{a}{b}"
          onChange={(e) => setLatex(e.target.value)}
          onKeyDown={onKeyDown}
        />
      )}
      <div
        className={`inline-math-preview ${display ? "block" : ""}`}
        dangerouslySetInnerHTML={{
          __html: previewHtml || "<span class=\"muted\">preview</span>",
        }}
      />
      {display && <div className="inline-math-hint muted">Ctrl+Enter to apply</div>}
    </div>
  );
}
