import { useMemo, useState } from "react";
import type { Folder } from "@omnilog/shared";

interface Props {
  /** Title shown at the top of the picker. */
  title: string;
  folders: Folder[];
  /** Currently selected (or current parent) — highlighted, not auto-confirmed. */
  currentId: string | null;
  /** Folder ids that should not be offered as a destination (e.g. self + descendants). */
  exclude?: ReadonlySet<string>;
  /** Whether "Root" (null) is offered. Default true. */
  allowRoot?: boolean;
  onSelect: (folderId: string | null) => void;
  onCancel: () => void;
}

/**
 * Lightweight modal that lets the caller pick a destination folder. Used by
 * "Move folder" and "Move entry" flows. The picker shows the folder tree with
 * shallow indentation so it stays usable even for several hundred folders.
 */
export function FolderPicker({
  title,
  folders,
  currentId,
  exclude,
  allowRoot = true,
  onSelect,
  onCancel,
}: Props) {
  const [picked, setPicked] = useState<string | null>(currentId);
  const ex = exclude ?? new Set<string>();

  // Sort folders into a stable, indented order by walking from each root.
  const tree = useMemo(() => buildTree(folders, ex), [folders, ex]);

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal folder-picker" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <ul className="folder-tree">
          {allowRoot && (
            <li
              className={`folder-tree-item ${picked === null ? "selected" : ""}`}
              onClick={() => setPicked(null)}
              onDoubleClick={() => onSelect(null)}
            >
              <span className="muted small">/</span> Root
            </li>
          )}
          {tree.map(({ folder, depth }) => (
            <li
              key={folder._id}
              className={`folder-tree-item ${picked === folder._id ? "selected" : ""}`}
              style={{ paddingLeft: 12 + depth * 14 }}
              onClick={() => setPicked(folder._id)}
              onDoubleClick={() => onSelect(folder._id)}
              title={folder.ownerUsername ? `Shared by ${folder.ownerUsername}` : undefined}
            >
              {folder.name}
              {folder.ownerUsername && (
                <span className="muted small"> @{folder.ownerUsername}</span>
              )}
            </li>
          ))}
          {tree.length === 0 && !allowRoot && (
            <li className="muted">No available destination.</li>
          )}
        </ul>
        <div className="actions">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn primary" onClick={() => onSelect(picked)}>
            Move here
          </button>
        </div>
      </div>
    </div>
  );
}

function buildTree(
  folders: Folder[],
  exclude: ReadonlySet<string>,
): { folder: Folder; depth: number }[] {
  const byParent = new Map<string | null, Folder[]>();
  for (const f of folders) {
    if (exclude.has(f._id)) continue;
    const key = f.parentId ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(f);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.name.localeCompare(b.name));

  const out: { folder: Folder; depth: number }[] = [];
  function walk(parent: string | null, depth: number) {
    for (const f of byParent.get(parent) ?? []) {
      out.push({ folder: f, depth });
      walk(f._id, depth + 1);
    }
  }
  walk(null, 0);
  return out;
}

/** Build the set of `id + every descendant id` so we can exclude a sub-tree. */
export function descendantsOf(folders: Folder[], id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const f of folders) {
    const key = f.parentId ?? "";
    if (!key) continue;
    const arr = children.get(key) ?? [];
    arr.push(f._id);
    children.set(key, arr);
  }
  const out = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    const top = stack.pop()!;
    for (const c of children.get(top) ?? []) {
      if (out.has(c)) continue;
      out.add(c);
      stack.push(c);
    }
  }
  return out;
}
