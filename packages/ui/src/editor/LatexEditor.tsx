import { useEffect, useMemo, useRef } from "react";
import katex from "katex";
import { useApp } from "../context";
import type { Draft } from "@omnilog/core";

/**
 * Plain-text LaTeX editor with a live KaTeX preview pane to the right.
 *
 * The whole document is a single LaTeX source string — block formulas wrap in
 * `$$ ... $$`, inline formulas in `$ ... $`. Anything outside formula
 * delimiters is rendered as a normal text paragraph. This is intentionally a
 * lightweight preview, not a full LaTeX compiler — we don't run pdflatex, we
 * just slice the source into formula and prose chunks.
 *
 * Storage: the LaTeX source is the canonical content and lives in
 * `contentText`. We also project it into `contentJson` as a single paragraph
 * so the entry round-trips through the existing storage pipeline.
 */
interface Props {
  draft: Draft;
}

const KATEX_OPTS = { throwOnError: false, errorColor: "#e5484d" } as const;

export function LatexEditor({ draft }: Props) {
  const patchCurrent = useApp((s) => s.patchCurrent);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const value = draft.contentText;

  // The rendered HTML preview. Recomputed on every keystroke — fine for the
  // doc sizes a personal work-journal sees; if this ever gets slow we can
  // debounce or virtualize.
  const html = useMemo(() => renderLatexDocument(value), [value]);

  function onChange(next: string) {
    patchCurrent({
      contentText: next,
      contentJson: textToParagraphDoc(next),
    });
  }

  // Tab key inserts two spaces inside the textarea rather than tabbing out of
  // the editor; behaves more like a real source editor.
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = value.slice(0, start) + "  " + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 2;
    });
  }

  useEffect(() => {
    taRef.current?.focus();
  }, [draft.id]);

  return (
    <div className="source-split">
      <textarea
        ref={taRef}
        className="source-input"
        value={value}
        spellCheck={false}
        placeholder={'Type LaTeX. Block formulas in $$ ... $$, inline in $ ... $.\nExample:\n\nThe Itô integral is\n\n$$ \\int_0^t f(s)\\, dW_s $$'}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div
        className="source-preview prosemirror-host"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

/**
 * Tokenise the document into prose paragraphs and KaTeX-rendered formulas.
 *
 * Grammar (informal):
 *   doc      ::= (block | paragraph)*
 *   block    ::= "$$" content "$$"
 *   inline   ::= "$" content "$"   (when not at start of line followed by another '$')
 *   content  ::= any chars that aren't the matching delimiter
 *
 * Edge cases handled:
 *  - unclosed `$$` or `$` — the rest of the document renders as KaTeX with
 *    `throwOnError:false`, so an in-progress formula previews live.
 *  - escaped `\$` is treated as a literal dollar sign.
 */
function renderLatexDocument(source: string): string {
  const out: string[] = [];
  // Split into paragraphs on blank lines so block formulas stand alone, while
  // keeping the original line breaks within each paragraph.
  const paragraphs = source.split(/\n\s*\n/);
  for (const para of paragraphs) {
    if (!para.trim()) continue;
    out.push(renderParagraph(para));
  }
  return out.join("\n");
}

function renderParagraph(para: string): string {
  // Match: \\$ (escape, literal) | $$...$$ | $...$ | any other char(s).
  // Using a single regex pass keeps the tokenizer order-of-precedence right.
  const re = /\\\$|\$\$([\s\S]*?)\$\$|\$([^\n$]+?)\$/g;
  const pieces: string[] = [];
  let pos = 0;
  let m: RegExpExecArray | null;
  let onlyBlock = true;
  let sawText = false;
  while ((m = re.exec(para))) {
    if (m.index > pos) {
      pieces.push(htmlText(para.slice(pos, m.index)));
      sawText = true;
    }
    if (m[0] === "\\$") {
      pieces.push("$");
      sawText = true;
    } else if (m[1] !== undefined) {
      // Block formula
      pieces.push(
        `<div class="latex-block">${katex.renderToString(m[1].trim(), {
          ...KATEX_OPTS,
          displayMode: true,
        })}</div>`,
      );
    } else if (m[2] !== undefined) {
      pieces.push(
        katex.renderToString(m[2], { ...KATEX_OPTS, displayMode: false }),
      );
      onlyBlock = false;
      sawText = true;
    }
    pos = re.lastIndex;
  }
  if (pos < para.length) {
    pieces.push(htmlText(para.slice(pos)));
    sawText = true;
  }
  // A paragraph that's nothing but a $$...$$ shouldn't get wrapped in <p>.
  if (onlyBlock && pieces.length === 1 && pieces[0].startsWith("<div class=\"latex-block\"")) {
    return pieces[0];
  }
  return sawText ? `<p>${pieces.join("")}</p>` : "";
}

function htmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
}

function textToParagraphDoc(text: string): { type: string; content: unknown[] } {
  // Keep a minimal ProseMirror doc so existing storage and search continue to
  // work; the canonical content is in contentText.
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : undefined,
      },
    ],
  };
}
