/**
 * ProseMirror JSON → Markdown / LaTeX serializers.
 *
 * These are pure functions that walk a ProseMirror document tree. They have
 * zero dependency on TipTap or any editor library, so both desktop and mobile
 * can use them for mode conversion and export.
 *
 * The inverse (Markdown/LaTeX → ProseMirror) lives in each client because it
 * needs a TipTap Editor instance to parse HTML into the editor's schema.
 */

interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: PMMark[];
  text?: string;
}

interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}

// ---- Markdown ----

function mdInline(nodes: PMNode[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((n) => {
      if (n.type === "text") return mdMarks(n.text ?? "", n.marks);
      if (n.type === "inlineMath") return `$${n.attrs?.latex ?? ""}$`;
      if (n.type === "hardBreak") return "  \n";
      if (n.type === "image") {
        const alt = (n.attrs?.caption as string) || "";
        const src = (n.attrs?.src as string) ?? "";
        return `![${alt}](${src})`;
      }
      return n.text ?? "";
    })
    .join("");
}

function mdMarks(text: string, marks: PMMark[] | undefined): string {
  if (!marks || marks.length === 0) return text;
  let r = text;
  for (const m of marks) {
    switch (m.type) {
      case "bold":
        r = `**${r}**`;
        break;
      case "italic":
        r = `*${r}*`;
        break;
      case "strike":
        r = `~~${r}~~`;
        break;
      case "code":
        r = `\`${r}\``;
        break;
      case "underline":
        r = `<u>${r}</u>`;
        break;
      case "link":
        r = `[${r}](${(m.attrs?.href as string) ?? ""})`;
        break;
    }
  }
  return r;
}

function mdBlock(node: PMNode): string {
  switch (node.type) {
    case "doc":
      return (node.content ?? []).map(mdBlock).join("\n\n");
    case "paragraph":
      return mdInline(node.content);
    case "heading":
      return "#".repeat((node.attrs?.level as number) ?? 1) + " " + mdInline(node.content);
    case "bulletList":
      return (node.content ?? []).map((item) => mdListItem(item, "- ")).join("\n");
    case "orderedList":
      return (node.content ?? []).map((item, i) => {
        const num = ((node.attrs?.start as number) ?? 1) + i;
        return mdListItem(item, `${num}. `);
      }).join("\n");
    case "taskList":
      return (node.content ?? []).map((item) => {
        const checked = item.attrs?.checked ? "x" : " ";
        return mdListItem(item, `- [${checked}] `);
      }).join("\n");
    case "blockquote": {
      const inner = (node.content ?? []).map(mdBlock).join("\n\n");
      return inner.split("\n").map((l) => "> " + l).join("\n");
    }
    case "codeBlock": {
      const lang = (node.attrs?.language as string) ?? "";
      const code = (node.content ?? []).map((n) => n.text ?? "").join("");
      return "```" + lang + "\n" + code + "\n```";
    }
    case "horizontalRule":
      return "---";
    case "blockMath":
      return "$$\n" + (node.attrs?.latex ?? "") + "\n$$";
    case "image": {
      const alt = (node.attrs?.caption as string) || "";
      const src = (node.attrs?.src as string) ?? "";
      return `![${alt}](${src})`;
    }
    case "table":
      return mdTable(node);
    default:
      return mdInline(node.content);
  }
}

function mdListItem(item: PMNode, prefix: string): string {
  const children = item.content ?? [];
  if (children.length === 0) return prefix;
  const indent = " ".repeat(prefix.length);
  return children
    .map((child, i) => {
      const md = mdBlock(child);
      if (i === 0) return prefix + md;
      return md.split("\n").map((l) => indent + l).join("\n");
    })
    .join("\n");
}

function mdTable(node: PMNode): string {
  const rows = (node.content ?? []).map((row) =>
    (row.content ?? []).map((cell) =>
      (cell.content ?? []).map((p) => mdInline(p.content)).join(" "),
    ),
  );
  if (rows.length === 0) return "";
  const cols = Math.max(...rows.map((r) => r.length));
  const widths = Array.from({ length: cols }, () => 3);
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      widths[i] = Math.max(widths[i], row[i].length);
    }
  }
  const fmt = (cells: string[]) =>
    "| " + Array.from({ length: cols }, (_, i) => (cells[i] ?? "").padEnd(widths[i])).join(" | ") + " |";
  const sep = "| " + widths.map((w) => "-".repeat(w)).join(" | ") + " |";
  const lines = [fmt(rows[0]), sep, ...rows.slice(1).map(fmt)];
  return lines.join("\n");
}

/** Serialize a ProseMirror document JSON to Markdown. */
export function docToMarkdown(json: unknown): string {
  const doc = json as PMNode | null;
  if (!doc || doc.type !== "doc") return "";
  return mdBlock(doc);
}

// ---- LaTeX (prose + math, no structural markup) ----

function texInline(nodes: PMNode[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((n) => {
      if (n.type === "text") return n.text ?? "";
      if (n.type === "inlineMath") return `$${n.attrs?.latex ?? ""}$`;
      if (n.type === "hardBreak") return "\n";
      return n.text ?? "";
    })
    .join("");
}

function texBlock(node: PMNode): string {
  switch (node.type) {
    case "doc":
      return (node.content ?? []).map(texBlock).join("\n\n");
    case "paragraph":
    case "heading":
      return texInline(node.content);
    case "bulletList":
    case "orderedList":
    case "taskList":
      return (node.content ?? [])
        .map((item) => (item.content ?? []).map(texBlock).join("\n"))
        .join("\n");
    case "blockquote":
      return (node.content ?? []).map(texBlock).join("\n\n");
    case "codeBlock":
      return (node.content ?? []).map((n) => n.text ?? "").join("");
    case "horizontalRule":
      return "";
    case "blockMath":
      return "$$\n" + (node.attrs?.latex ?? "") + "\n$$";
    case "table":
      return (node.content ?? [])
        .map((row) =>
          (row.content ?? [])
            .map((cell) => (cell.content ?? []).map((p) => texInline(p.content)).join(" "))
            .join("\t"),
        )
        .join("\n");
    default:
      return texInline(node.content);
  }
}

/** Serialize a ProseMirror document JSON to LaTeX source. */
export function docToLatex(json: unknown): string {
  const doc = json as PMNode | null;
  if (!doc || doc.type !== "doc") return "";
  return texBlock(doc);
}
