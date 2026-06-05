import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import type { Transaction } from "@tiptap/pm/state";

import { useApp } from "../../store/appStore";
import { Toolbar } from "./Toolbar";
import { InlineMathPopover } from "./InlineMathPopover";
import { EDIT_MATH_EVENT, type EditMathDetail } from "./MathNode";
import { insertImagesFromFiles } from "./imageInsert";
import { buildRichExtensions } from "./richExtensions";
import type { Draft } from "../../lib/drafts";
import { promptDialog } from "../../ui/dialog";

interface MathState {
  open: boolean;
  /** true = block/display formula, false = inline. */
  display: boolean;
  pos: number;
  latex: string;
  anchor: { left: number; top: number } | null;
  /** Set when the popover was opened for a freshly inserted empty node. */
  fresh: boolean;
}

interface Props {
  draft: Draft;
}

/**
 * Rich-text editor (TipTap + KaTeX). Both inline and block formulas are edited
 * in place via a floating popover anchored at the node — no modal dialog.
 */
export function RichEditor({ draft }: Props) {
  const initial = useRef(draft).current;
  const patchCurrent = useApp((s) => s.patchCurrent);
  const saveNow = useApp((s) => s.saveNow);

  const [math, setMath] = useState<MathState>({
    open: false,
    display: false,
    pos: 0,
    latex: "",
    anchor: null,
    fresh: false,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const editor = useEditor({
    extensions: buildRichExtensions(),
    content: (initial?.contentJson as object) ?? { type: "doc", content: [{ type: "paragraph" }] },
    autofocus: "end",
    editorProps: {
      attributes: { class: "prosemirror-host" },
      handlePaste(_view, event): boolean {
        const ed = editorRef.current;
        const files = event.clipboardData?.files;
        if (files && files.length > 0 && ed) {
          return insertImagesFromFiles(ed, files);
        }
        return false;
      },
      handleDrop(_view, event): boolean {
        const ed = editorRef.current;
        const files = (event as DragEvent).dataTransfer?.files;
        if (files && files.length > 0 && ed) {
          insertImagesFromFiles(ed, files);
          return true;
        }
        return false;
      },
      handleKeyDown(_view, event): boolean {
        const mod = event.ctrlKey || event.metaKey;
        if (!mod) return false;
        const ed = editorRef.current;
        const key = event.key.toLowerCase();
        if (key === "s") {
          event.preventDefault();
          void saveNow();
          return true;
        }
        if (key === "f") {
          event.preventDefault();
          document.querySelector<HTMLInputElement>("input.search")?.focus();
          return true;
        }
        if (key === "k") {
          event.preventDefault();
          const prev = (ed?.getAttributes("link").href as string) ?? "";
          void promptDialog({
            title: "Link",
            placeholder: "https://...",
            defaultValue: prev,
            confirmLabel: "Apply",
          }).then((url) => {
            if (url === null) return;
            if (url === "") ed?.chain().focus().unsetLink().run();
            else ed?.chain().focus().setLink({ href: url }).run();
          });
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      patchCurrent({
        contentJson: editor.getJSON(),
        contentText: editor.getText(),
        contentHtml: editor.getHTML(),
      });
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Math node views dispatch EDIT_MATH_EVENT on double-click. We route the
  // event to either the inline popover or the block modal based on `display`.
  // Anchor a popover just under the node at `pos`, relative to the editor host.
  function anchorFor(pos: number): { left: number; top: number } | null {
    const ed = editorRef.current;
    const cont = containerRef.current?.getBoundingClientRect();
    if (!ed || !cont) return null;
    try {
      const c = ed.view.coordsAtPos(pos);
      return { left: c.left - cont.left, top: c.bottom - cont.top + 4 };
    } catch {
      return null;
    }
  }

  // Math node views dispatch EDIT_MATH_EVENT on double-click -> open the popover
  // (inline or block) anchored at the node.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<EditMathDetail>).detail;
      setMath({
        open: true,
        display: detail.display,
        pos: detail.pos,
        latex: detail.latex,
        anchor: anchorFor(detail.pos),
        fresh: false,
      });
    };
    el.addEventListener(EDIT_MATH_EVENT, handler);
    return () => el.removeEventListener(EDIT_MATH_EVENT, handler);
  }, []);

  // Insert an empty formula node and immediately open the in-place editor for
  // it — no modal. `display` chooses block vs inline.
  function openInsertMath(display: boolean) {
    const ed = editorRef.current ?? editor;
    if (!ed) return;
    const type = display ? "blockMath" : "inlineMath";
    ed.chain().focus().insertContent({ type, attrs: { latex: "" } }).run();
    // Locate the freshly inserted empty node by scanning the doc.
    let pos = ed.state.selection.from;
    ed.state.doc.descendants((node, p) => {
      if (node.type.name === type && !String(node.attrs.latex ?? "").trim()) pos = p;
    });
    requestAnimationFrame(() => {
      setMath({ open: true, display, pos, latex: "", anchor: anchorFor(pos), fresh: true });
    });
  }

  function submitMath(latex: string) {
    const ed = editorRef.current;
    if (!ed) {
      setMath((s) => ({ ...s, open: false }));
      return;
    }
    const pos = math.pos;
    const trimmed = latex.trim();
    ed.chain()
      .focus()
      .command(({ tr }: { tr: Transaction }) => {
        if (!trimmed) tr.delete(pos, pos + 1);
        else tr.setNodeMarkup(pos, undefined, { latex: trimmed });
        return true;
      })
      .run();
    setMath((s) => ({ ...s, open: false }));
  }

  function cancelMath() {
    const ed = editorRef.current;
    if (ed && math.fresh) {
      const pos = math.pos;
      ed.chain()
        .focus()
        .command(({ tr }: { tr: Transaction }) => {
          tr.delete(pos, pos + 1);
          return true;
        })
        .run();
    }
    setMath((s) => ({ ...s, open: false }));
  }

  return (
    <div ref={containerRef} className="rich-editor-host">
      {editor && <Toolbar editor={editor} onInsertMath={openInsertMath} />}
      <EditorContent editor={editor} className="editor-content" />

      {math.open && (
        <InlineMathPopover
          initialLatex={math.latex}
          display={math.display}
          anchor={math.anchor}
          onSubmit={submitMath}
          onClose={cancelMath}
        />
      )}
    </div>
  );
}
