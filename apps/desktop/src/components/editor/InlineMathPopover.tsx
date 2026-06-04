import { useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";

interface Props {
  initialLatex: string;
  /** Position relative to the editor host (px). null = center fallback. */
  anchor: { left: number; top: number } | null;
  onSubmit: (latex: string) => void;
  onClose: () => void;
}

/**
 * Small floating editor for inline formulas, anchored just under the node.
 * Live KaTeX preview as you type; Enter or Ctrl+Enter confirms, Esc closes.
 * Click-outside also closes. This replaces the heavyweight modal for inline
 * math; block math still uses MathDialog for the templates + larger area.
 */
export function InlineMathPopover({ initialLatex, anchor, onSubmit, onClose }: Props) {
  const [latex, setLatex] = useState(initialLatex);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLatex(initialLatex);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [initialLatex]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        // Save on click-away rather than discarding, so a stray click doesn't
        // lose work. Empty input is treated as "remove" (caller decides).
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
        displayMode: false,
        throwOnError: false,
        errorColor: "#e5484d",
      });
    } catch {
      return "";
    }
  }, [latex]);

  const style: React.CSSProperties = anchor
    ? { left: anchor.left, top: anchor.top }
    : { left: "50%", top: 80, transform: "translateX(-50%)" };

  return (
    <div ref={popRef} className="inline-math-popover" style={style}>
      <input
        ref={inputRef}
        type="text"
        className="inline-math-input"
        spellCheck={false}
        value={latex}
        placeholder="LaTeX, e.g. \\frac{a}{b}"
        onChange={(e) => setLatex(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit(latex);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <div
        className="inline-math-preview"
        dangerouslySetInnerHTML={{
          __html: previewHtml || "<span class=\"muted\">preview</span>",
        }}
      />
    </div>
  );
}
