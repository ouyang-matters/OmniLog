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
import type { Extensions } from "@tiptap/core";
import { InlineMath, BlockMath } from "./MathNode";
import { ImageNode } from "./ImageNode";
import { AutoPair } from "./extensions/AutoPair";
import { MathShortcuts } from "./extensions/MathShortcuts";

/**
 * The single source of truth for the rich-text schema. Shared by the live
 * RichEditor and by the headless converter used to turn Markdown/LaTeX source
 * into the same rich document (so content syncs across editor modes).
 */
export function buildRichExtensions(placeholder = "Start writing your work log..."): Extensions {
  return [
    StarterKit,
    Underline,
    Link.configure({ openOnClick: false, autolink: true }),
    Placeholder.configure({ placeholder }),
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
  ];
}
