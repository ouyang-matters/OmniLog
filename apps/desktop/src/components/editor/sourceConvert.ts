import { Editor } from "@tiptap/core";
import { buildRichExtensions } from "./richExtensions";
import { renderMarkdown, renderLatexDocument, nodeMath } from "./sourceRender";

/**
 * Convert Markdown / LaTeX source into a rich-text ProseMirror document, so
 * switching from a source mode to rich keeps the content (headings, lists,
 * emphasis, and math become real nodes). Uses one shared headless TipTap editor
 * — the same schema as the live RichEditor — to parse node-markup HTML.
 */

let headless: Editor | null = null;

function converter(): Editor {
  if (!headless) {
    headless = new Editor({
      extensions: buildRichExtensions(),
      content: "<p></p>",
      injectCSS: false,
    });
  }
  return headless;
}

function htmlToDoc(html: string): unknown | null {
  try {
    const ed = converter();
    ed.commands.setContent(html || "<p></p>", false);
    return ed.getJSON();
  } catch {
    return null;
  }
}

function textDoc(text: string) {
  return {
    type: "doc",
    content: [
      { type: "paragraph", content: text ? [{ type: "text", text }] : undefined },
    ],
  };
}

export function markdownToDoc(src: string): unknown {
  return htmlToDoc(renderMarkdown(src, nodeMath)) ?? textDoc(src);
}

export function latexToDoc(src: string): unknown {
  return htmlToDoc(renderLatexDocument(src, nodeMath)) ?? textDoc(src);
}

export function sourceToDoc(mode: "markdown" | "latex" | "rich", src: string): unknown {
  if (mode === "markdown") return markdownToDoc(src);
  if (mode === "latex") return latexToDoc(src);
  return textDoc(src);
}
