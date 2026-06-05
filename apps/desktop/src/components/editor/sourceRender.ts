import katex from "katex";

/**
 * Shared Markdown / LaTeX source renderers, parametrized by how math is
 * emitted. Two consumers:
 *   - the live preview pane renders math with KaTeX (`katexMath`),
 *   - the rich-mode converter emits math-node markup (`nodeMath`) which the
 *     TipTap schema parses back into inline/block math nodes.
 * This keeps source and rich modes in sync from one parser.
 */

export interface MathEmitter {
  inline: (tex: string) => string;
  block: (tex: string) => string;
}

const KATEX_OPTS = { throwOnError: false, errorColor: "#e5484d" } as const;

export const katexMath: MathEmitter = {
  inline: (tex) => {
    try {
      return katex.renderToString(tex, { ...KATEX_OPTS, displayMode: false });
    } catch {
      return escapeHtml(tex);
    }
  },
  block: (tex) => {
    try {
      return `<div class="latex-block">${katex.renderToString(tex, { ...KATEX_OPTS, displayMode: true })}</div>`;
    } catch {
      return `<div class="latex-block">${escapeHtml(tex)}</div>`;
    }
  },
};

export const nodeMath: MathEmitter = {
  inline: (tex) => `<span data-inline-math data-latex="${escAttr(tex)}"></span>`,
  block: (tex) => `<div data-block-math data-latex="${escAttr(tex)}"></div>`,
};

const PH_OPEN = "";
const PH_CLOSE = "";

// ---------- Markdown ----------

export function renderMarkdown(src: string, math: MathEmitter): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++;
      out.push(
        `<pre><code${lang ? ` class="language-${escAttr(lang)}"` : ""}>${escapeHtml(body.join("\n"))}</code></pre>`,
      );
      continue;
    }

    if (line.startsWith("$$")) {
      const rest = line.slice(2);
      const inlineEnd = rest.lastIndexOf("$$");
      if (inlineEnd >= 0) {
        out.push(math.block(rest.slice(0, inlineEnd).trim()));
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
        body.push(last.slice(0, last.indexOf("$$")));
        i++;
      }
      out.push(math.block(body.join("\n").trim()));
      continue;
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      out.push(`<h${h[1].length}>${renderInline(h[2], math)}</h${h[1].length}>`);
      i++;
      continue;
    }

    if (/^(?:-\s*){3,}$|^(?:\*\s*){3,}$|^(?:_\s*){3,}$/.test(line.trim())) {
      out.push("<hr/>");
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${renderMarkdown(body.join("\n"), math)}</blockquote>`);
      continue;
    }

    const bullet = /^([-*+])\s+(.*)$/.exec(line);
    const ordered = /^(\d+)\.\s+(.*)$/.exec(line);
    if (bullet || ordered) {
      const tag = bullet ? "ul" : "ol";
      const items: string[] = [];
      while (i < lines.length) {
        const b = /^([-*+])\s+(.*)$/.exec(lines[i]);
        const o = /^(\d+)\.\s+(.*)$/.exec(lines[i]);
        if (!b && !o) break;
        items.push(`<li>${renderInline((b ?? o)![2], math)}</li>`);
        i++;
      }
      out.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

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
    out.push(`<p>${renderInline(para.join("\n"), math)}</p>`);
  }

  return out.join("\n");
}

function renderInline(text: string, math: MathEmitter): string {
  const placeholders: string[] = [];
  const stash = (html: string) => {
    placeholders.push(html);
    return `${PH_OPEN}${placeholders.length - 1}${PH_CLOSE}`;
  };

  let s = text;
  s = s.replace(/`([^`]+)`/g, (_m, code) => stash(`<code>${escapeHtml(code)}</code>`));
  s = s.replace(/(?<!\\)\$([^\n$]+?)\$/g, (_m, tex) => stash(math.inline(tex)));

  s = escapeHtml(s);

  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_m, alt, url) =>
    `<img alt="${escAttr(alt)}" src="${escAttr(url)}"/>`,
  );
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_m, label, url) =>
    `<a href="${escAttr(url)}">${label}</a>`,
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

// ---------- LaTeX document ----------

export function renderLatexDocument(source: string, math: MathEmitter): string {
  const out: string[] = [];
  for (const para of source.split(/\n\s*\n/)) {
    if (!para.trim()) continue;
    out.push(renderLatexParagraph(para, math));
  }
  return out.join("\n");
}

function renderLatexParagraph(para: string, math: MathEmitter): string {
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
      pieces.push(math.block(m[1].trim()));
    } else if (m[2] !== undefined) {
      pieces.push(math.inline(m[2]));
      onlyBlock = false;
      sawText = true;
    }
    pos = re.lastIndex;
  }
  if (pos < para.length) {
    pieces.push(htmlText(para.slice(pos)));
    sawText = true;
  }
  if (onlyBlock && pieces.length === 1) {
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
