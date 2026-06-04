import { useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";

interface Props {
  open: boolean;
  initialLatex: string;
  display: boolean;
  onSubmit: (latex: string) => void;
  onClose: () => void;
}

/** Common LaTeX snippets offered as one-click templates. */
const TEMPLATES: { label: string; latex: string }[] = [
  { label: "Fraction", latex: "\\frac{a}{b}" },
  { label: "Superscript", latex: "x^{2}" },
  { label: "Subscript", latex: "x_{i}" },
  { label: "Integral", latex: "\\int_{a}^{b} f(x)\\,dx" },
  { label: "Summation", latex: "\\sum_{i=1}^{n} a_i" },
  { label: "Matrix", latex: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}" },
  { label: "Sqrt", latex: "\\sqrt{x}" },
  { label: "Limit", latex: "\\lim_{x \\to \\infty} f(x)" },
];

export function MathDialog({ open, initialLatex, display, onSubmit, onClose }: Props) {
  const [latex, setLatex] = useState(initialLatex);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setLatex(initialLatex);
      // Focus after the dialog paints.
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [open, initialLatex]);

  const previewHtml = useMemo(() => {
    if (!latex.trim()) return "";
    try {
      return katex.renderToString(latex, {
        displayMode: display,
        throwOnError: false,
        errorColor: "#e5484d",
      });
    } catch {
      return `<span class="math-error">${escapeHtml(latex)}</span>`;
    }
  }, [latex, display]);

  if (!open) return null;

  function insertTemplate(snippet: string) {
    const el = textareaRef.current;
    if (!el) {
      setLatex((v) => v + snippet);
      return;
    }
    const start = el.selectionStart ?? latex.length;
    const end = el.selectionEnd ?? latex.length;
    setLatex(latex.slice(0, start) + snippet + latex.slice(end));
    requestAnimationFrame(() => el.focus());
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{display ? "Block formula" : "Inline formula"}</h3>

        <div className="template-row">
          {TEMPLATES.map((t) => (
            <button key={t.label} className="btn ghost small" onClick={() => insertTemplate(t.latex)}>
              {t.label}
            </button>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          className="math-input"
          value={latex}
          spellCheck={false}
          placeholder="Enter LaTeX, e.g. \\frac{a}{b}"
          onChange={(e) => setLatex(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              onSubmit(latex);
            }
            if (e.key === "Escape") onClose();
          }}
        />

        <div className="math-preview-label muted">Preview</div>
        <div
          className={`math-preview ${display ? "block" : "inline"}`}
          dangerouslySetInnerHTML={{ __html: previewHtml || "<span class='muted'>-</span>" }}
        />

        <div className="actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onSubmit(latex)}>
            {initialLatex ? "Update" : "Insert"}
          </button>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
