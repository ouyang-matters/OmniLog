import { useEffect, useMemo, useRef } from "react";
import katex from "katex";
import { useApp } from "../../store/appStore";
import type { Draft } from "../../lib/drafts";

/**
 * Plain-text Markdown editor with a live HTML preview pane.
 *
 * The parser is intentionally small — it understands what a personal work-log
 * needs: headings (#…######), bullet/numbered lists, blockquotes, fenced code
 * blocks, horizontal rules, bold/italic/code spans, and links — plus inline
 * `$…$` and block `$$…$$` math via KaTeX so the same shortcuts work as in the
 * other editors. It deliberately does not handle the full CommonMark spec
 * (HTML inline, tables, footnotes, reference links, setext headings, etc.) —
 * those can be added later if needed. The source remains authoritative either
 * way; preview is a guide, not the storage format.
 */
interface Props {
  draft: Draft;
}

const KATEX_OPTS = { throwOnError: false, errorColor: "#e5484d" } as const;
// Private-Use-Area delimiter for inline placeholders — Markdown source never
// contains these characters, so they survive the HTML escape step intact.
const PH_OPEN = "";
const PH_CLOSE = "";

export function MarkdownEditor({ draft }: Props) {
  const patchCurrent = useApp((s) => s.patchCurrent);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const value = draft.contentText;

  const html = useMemo(() => renderMarkdown(value), [value]);

  function onChange(next: string) {
    patchCurrent({
      contentText: next,
      contentJson: textToParagraphDoc(next),
    });
  }

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
        placeholder={'# Heading\n\nMarkdown with inline math like $x^2 + y^2$ and block math:\n\n$$\n\\int_0^1 x\\,dx = \\tfrac{1}{2}\n$$\n\n- bullet\n- list\n\n`code`, **bold**, *italic*, [links](https://example.com).'}
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

// ---------- Minimal Markdown renderer ----------

function renderMarkdown(src: string): string {
  // Normalise line endings.
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block:  ```lang … ```
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // consume closing fence (if present)
      out.push(
        `<pre><code${lang ? ` class="language-${escAttr(lang)}"` : ""}>${escapeHtml(body.join("\n"))}</code></pre>`,
      );
      continue;
    }

    // Block math:  $$ … $$  (may span multiple lines)
    if (line.startsWith("$$")) {
      const rest = line.slice(2);
      const inlineEnd = rest.lastIndexOf("$$");
      if (inlineEnd >= 0) {
        const tex = rest.slice(0, inlineEnd).trim();
        out.push(`<div class="latex-block">${katex.renderToString(tex, { ...KATEX_OPTS, displayMode: true })}</div>`);
        i++;
        continue;
      }
      const body: string[] = [rest];
      i++;
      while (i < lines.length && !lines[i].includes("$$")) {
        body.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        const last = lines[i];
        const idx = last.indexOf("$$");
        body.push(last.slice(0, idx));
        i++;
      }
      const tex = body.join("\n").trim();
      out.push(`<div class="latex-block">${katex.renderToString(tex, { ...KATEX_OPTS, displayMode: true })}</div>`);
      continue;
    }

    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(?:-\s*){3,}$|^(?:\*\s*){3,}$|^(?:_\s*){3,}$/.test(line.trim())) {
      out.push("<hr/>");
      i++;
      continue;
    }

    // Blockquote (a run of "> " lines)
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${renderMarkdown(body.join("\n"))}</blockquote>`);
      continue;
    }

    // List (bullet or ordered)
    const bullet = /^([-*+])\s+(.*)$/.exec(line);
    const ordered = /^(\d+)\.\s+(.*)$/.exec(line);
    if (bullet || ordered) {
      const tag = bullet ? "ul" : "ol";
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i];
        const b = /^([-*+])\s+(.*)$/.exec(cur);
        const o = /^(\d+)\.\s+(.*)$/.exec(cur);
        if (!b && !o) break;
        const text = (b ?? o)![2];
        items.push(`<li>${renderInline(text)}</li>`);
        i++;
      }
      out.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    // Paragraph — gather contiguous non-empty, non-special lines.
    const para: string[] = [line];
    i++;
    while (i < lines.length) {
      const nxt = lines[i];
      if (!nxt.trim()) break;
      if (/^#{1,6}\s+/.test(nxt)) break;
      if (/^```/.test(nxt)) break;
      if (nxt.startsWith("$$")) break;
      if (/^>\s?/.test(nxt)) break;
      if (/^([-*+])\s+/.test(nxt) || /^\d+\.\s+/.test(nxt)) break;
      para.push(nxt);
      i++;
    }
    out.push(`<p>${renderInline(para.join("\n"))}</p>`);
  }

  return out.join("\n");
}

/**
 * Inline span-level renderer. Pulls out code spans and math first (their
 * insides shouldn't be parsed as Markdown), HTML-escapes the rest, then
 * applies formatting and finally restores the placeholders.
 */
function renderInline(text: string): string {
  const placeholders: string[] = [];
  function stash(html: string): string {
    placeholders.push(html);
    return `${PH_OPEN}${placeholders.length - 1}${PH_CLOSE}`;
  }

  let s = text;
  s = s.replace(/`([^`]+)`/g, (_m, code) => stash(`<code>${escapeHtml(code)}</code>`));
  s = s.replace(/(?<!\\)\$([^\n$]+?)\$/g, (_m, tex) =>
    stash(katex.renderToString(tex, { ...KATEX_OPTS, displayMode: false })),
  );

  s = escapeHtml(s);

  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_m, alt, url) =>
    `<img alt="${escAttr(alt)}" src="${escAttr(url)}"/>`,
  );
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_m, label, url) =>
    `<a href="${escAttr(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`,
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  s = s.replace(/(  |\\)\n/g, "<br/>\n");

  const restoreRe = new RegExp(`${PH_OPEN}(\\d+)${PH_CLOSE}`, "g");
  s = s.replace(restoreRe, (_m, idx) => placeholders[Number(idx)] ?? "");
  return s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escAttr(s: string): string {
  return escapeHtml(s);
}

function textToParagraphDoc(text: string): { type: string; content: unknown[] } {
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
