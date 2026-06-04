import type { Editor } from "@tiptap/react";
import { pickAndInsertImage } from "./imageInsert";
import { Icon } from "../../assets/icons";

interface Props {
  editor: Editor;
  onInsertMath: (display: boolean) => void;
}

export function Toolbar({ editor, onInsertMath }: Props) {
  const is = (name: string, attrs?: Record<string, unknown>) =>
    editor.isActive(name, attrs) ? "active" : "";

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <select
          className="heading-select"
          value={
            editor.isActive("heading", { level: 1 })
              ? "h1"
              : editor.isActive("heading", { level: 2 })
                ? "h2"
                : editor.isActive("heading", { level: 3 })
                  ? "h3"
                  : "p"
          }
          onChange={(e) => {
            const v = e.target.value;
            if (v === "p") editor.chain().focus().setParagraph().run();
            else
              editor
                .chain()
                .focus()
                .toggleHeading({ level: Number(v[1]) as 1 | 2 | 3 })
                .run();
          }}
        >
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
      </div>

      <div className="toolbar-group">
        <button className={is("bold")} title="Bold (Ctrl+B)" onClick={() => editor.chain().focus().toggleBold().run()}><Icon name="bold" /></button>
        <button className={is("italic")} title="Italic (Ctrl+I)" onClick={() => editor.chain().focus().toggleItalic().run()}><Icon name="italic" /></button>
        <button className={is("underline")} title="Underline (Ctrl+U)" onClick={() => editor.chain().focus().toggleUnderline().run()}><Icon name="underline" /></button>
        <button className={is("strike")} title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()}><Icon name="strike" /></button>
        <button className={is("code")} title="Inline code" onClick={() => editor.chain().focus().toggleCode().run()}><Icon name="code" /></button>
      </div>

      <div className="toolbar-group">
        <button className={is("bulletList")} title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}><Icon name="bulletList" /></button>
        <button className={is("orderedList")} title="Ordered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}><Icon name="orderedList" /></button>
        <button className={is("taskList")} title="Task list" onClick={() => editor.chain().focus().toggleTaskList().run()}><Icon name="taskList" /></button>
      </div>

      <div className="toolbar-group">
        <button className={is("blockquote")} title="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}><Icon name="quote" /></button>
        <button className={is("codeBlock")} title="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Icon name="codeBlock" /></button>
        <button title="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Icon name="divider" /></button>
        <button title="Table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Icon name="table" /></button>
      </div>

      <div className="toolbar-group">
        <button title="Inline formula" onClick={() => onInsertMath(false)}><Icon name="mathInline" /></button>
        <button title="Block formula" onClick={() => onInsertMath(true)}><Icon name="mathBlock" /></button>
        <button title="Insert image" onClick={() => void pickAndInsertImage(editor)}><Icon name="image" /></button>
      </div>

      <div className="toolbar-group">
        <button title="Undo (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()}><Icon name="undo" /></button>
        <button title="Redo (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()}><Icon name="redo" /></button>
      </div>
    </div>
  );
}
