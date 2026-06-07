import { useEffect, useState } from "react";
import type { Folder } from "@omnilog/shared";
import { Icon } from "./icons";

/** A bottom sheet with a dimmed backdrop. Tapping the backdrop closes it. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {title && <div className="sheet-title">{title}</div>}
        {children}
      </div>
    </div>
  );
}

export interface SheetAction {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onPick: () => void;
}

/** A list of tappable actions in a bottom sheet. */
export function ActionSheet({
  open,
  onClose,
  title,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  actions: SheetAction[];
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="sheet-actions">
        {actions.map((a) => (
          <button
            key={a.label}
            className={`sheet-action ${a.danger ? "danger" : ""}`}
            onClick={() => {
              onClose();
              a.onPick();
            }}
          >
            {a.icon && <span className="sheet-action-icon">{a.icon}</span>}
            {a.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** A single-line text prompt in a bottom sheet. */
export function PromptSheet({
  open,
  title,
  label,
  initial,
  placeholder,
  confirmText,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  title: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmText?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial ?? "");
  // Reset the field each time the sheet is (re)opened.
  useEffect(() => {
    if (open) setValue(initial ?? "");
  }, [open, initial]);

  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      <form
        className="sheet-form"
        onSubmit={(e) => {
          e.preventDefault();
          const v = value.trim();
          if (!v) return;
          onSubmit(v);
        }}
      >
        {label && <span className="field-label">{label}</span>}
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        <div className="sheet-buttons">
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
            {confirmText ?? "Save"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** A confirm/cancel bottom sheet for destructive actions. */
export function ConfirmSheet({
  open,
  title,
  message,
  confirmText,
  danger,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      {message && <p className="sheet-message">{message}</p>}
      <div className="sheet-buttons">
        <button type="button" className="btn btn-outline" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
          onClick={() => {
            onCancel();
            onConfirm();
          }}
        >
          {confirmText ?? "Confirm"}
        </button>
      </div>
    </Sheet>
  );
}

/** Pick a destination folder (or root). Excludes `excludeId` (e.g. self). */
export function FolderPickerSheet({
  open,
  title,
  folders,
  excludeId,
  onCancel,
  onPick,
}: {
  open: boolean;
  title: string;
  folders: Folder[];
  excludeId?: string;
  onCancel: () => void;
  onPick: (folderId: string | null) => void;
}) {
  const options = folders.filter((f) => f._id !== excludeId);
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      <div className="sheet-actions">
        <button
          className="sheet-action"
          onClick={() => {
            onCancel();
            onPick(null);
          }}
        >
          <span className="sheet-action-icon"><Icon name="home" size={20} /></span> Root (no folder)
        </button>
        {options.map((f) => (
          <button
            key={f._id}
            className="sheet-action"
            onClick={() => {
              onCancel();
              onPick(f._id);
            }}
          >
            <span className="sheet-action-icon"><Icon name="folder" size={20} /></span> {f.name}
          </button>
        ))}
        {options.length === 0 && (
          <p className="sheet-message">No other folders yet.</p>
        )}
      </div>
    </Sheet>
  );
}
