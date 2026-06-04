import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import type { Transaction } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";

import { useApp } from "../../store/appStore";
import { Toolbar } from "./Toolbar";
import { MathDialog } from "./MathDialog";
import { InlineMathPopover } from "./InlineMathPopover";
import { InlineMath, BlockMath, EDIT_MATH_EVENT, type EditMathDetail } from "./MathNode";
import { ImageNode } from "./ImageNode";
import { insertImagesFromFiles } from "./imageInsert";
import { AutoPair } from "./extensions/AutoPair";
import { MathShortcuts } from "./extensions/MathShortcuts";
import type { Draft } from "../../lib/drafts";

interface MathDialogState {
  open: boolean;
  pos: number | null;
  latex: string;
}

interface InlineState {
  open: boolean;
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
 * Rich-text editor (TipTap + KaTeX). Block formulas open the modal dialog;
 * inline formulas open a floating popover anchored at the node.
 */
export function RichEditor({ draft }: Props) {
  const initial = useRef(draft).current;
  const patchCurrent = useApp((s) => s.patchCurrent);
  const saveNow = useApp((s) => s.saveNow);

  const [mathDialog, setMathDialog] = useState<MathDialogState>({ open: false, pos: null, latex: "" });
  const [inline, setInline] = useState<InlineState>({ open: false, pos: 0, latex: "", anchor: null, fresh: false });
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: "Start writing your work log..." }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      InlineMath,
      BlockMath,
      ImageNode,
      AutoPair,
      MathShortcuts,
    ],
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
          const url = window.prompt("Link URL", prev);
          if (url === null) return true;
          if (url === "") ed?.chain().focus().unsetLink().run();
          else ed?.chain().focus().setLink({ href: url }).run();
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
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<EditMathDetail>).detail;
      if (detail.display) {
        setMathDialog({ open: true, pos: detail.pos, latex: detail.latex });
        return;
      }
      // Inline math — anchor a popover at the node's bounding rect.
      const target = e.target as HTMLElement | null;
      const rect = target?.getBoundingClientRect();
      const container = containerRef.current?.getBoundingClientRect();
      const anchor = rect && container
        ? { left: rect.left - container.left, top: rect.bottom - container.top + 4 }
        : null;
      setInline({ open: true, pos: detail.pos, latex: detail.latex, anchor, fresh: false });
    };
    el.addEventListener(EDIT_MATH_EVENT, handler);
    return () => el.removeEventListener(EDIT_MATH_EVENT, handler);
  }, []);

  function openInsertMath(display: boolean) {
    if (display) {
      setMathDialog({ open: true, pos: null, latex: "" });
    } else {
      // Insert an empty inline node and immediately open the popover for it.
      if (!editor) return;
      const before = editor.state.selection.from;
      editor.chain().focus().insertContent({ type: "inlineMath", attrs: { latex: "" } }).run();
      const pos = before;
      // After the insert the DOM updates; query the node's rect on next tick.
      requestAnimationFrame(() => {
        const nodeEl = containerRef.current?.querySelector<HTMLElement>(
          ".math-inline:empty, .math-inline.math-empty",
        );
        const rect = nodeEl?.getBoundingClientRect();
        const container = containerRef.current?.getBoundingClientRect();
        const anchor = rect && container
          ? { left: rect.left - container.left, top: rect.bottom - container.top + 4 }
          : null;
        setInline({ open: true, pos, latex: "", anchor, fresh: true });
      });
    }
  }

  function submitBlockMath(latex: string) {
    if (!editor) return;
    if (mathDialog.pos === null) {
      editor.chain().focus().insertContent({ type: "blockMath", attrs: { latex } }).run();
    } else {
      const pos = mathDialog.pos;
      editor
        .chain()
        .focus()
        .command(({ tr }: { tr: Transaction }) => {
          tr.setNodeMarkup(pos, undefined, { latex });
          return true;
        })
        .run();
    }
    setMathDialog((m) => ({ ...m, open: false }));
  }

  function submitInline(latex: string) {
    if (!editor) {
      setInline((s) => ({ ...s, open: false }));
      return;
    }
    const pos = inline.pos;
    // Trim whitespace; an entirely empty inline node is useless, so drop it
    // (especially the fresh ones we auto-inserted from the toolbar).
    const trimmed = latex.trim();
    if (!trimmed) {
      editor
        .chain()
        .focus()
        .command(({ tr }: { tr: Transaction }) => {
          tr.delete(pos, pos + 1);
          return true;
        })
        .run();
    } else {
      editor
        .chain()
        .focus()
        .command(({ tr }: { tr: Transaction }) => {
          tr.setNodeMarkup(pos, undefined, { latex: trimmed });
          return true;
        })
        .run();
    }
    setInline((s) => ({ ...s, open: false }));
  }

  function cancelInline() {
    if (editor && inline.fresh) {
      const pos = inline.pos;
      editor
        .chain()
        .focus()
        .command(({ tr }: { tr: Transaction }) => {
          tr.delete(pos, pos + 1);
          return true;
        })
        .run();
    }
    setInline((s) => ({ ...s, open: false }));
  }

  return (
    <div ref={containerRef} className="rich-editor-host">
      {editor && <Toolbar editor={editor} onInsertMath={openInsertMath} />}
      <EditorContent editor={editor} className="editor-content" />

      <MathDialog
        open={mathDialog.open}
        initialLatex={mathDialog.latex}
        display={true}
        onSubmit={submitBlockMath}
        onClose={() => setMathDialog((m) => ({ ...m, open: false }))}
      />

      {inline.open && (
        <InlineMathPopover
          initialLatex={inline.latex}
          anchor={inline.anchor}
          onSubmit={submitInline}
          onClose={cancelInline}
        />
      )}
    </div>
  );
}
