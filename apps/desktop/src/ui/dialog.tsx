import { useEffect, useRef, useState } from "react";
import { create } from "zustand";

/**
 * App-wide custom dialog system. Replaces the browser's native
 * confirm()/prompt()/alert() (which are unstyled and inconsistent) with
 * modals that match the app design. Use the async helpers anywhere:
 *
 *   if (await confirmDialog({ title: "Delete entry?", danger: true })) { ... }
 *   const name = await promptDialog({ title: "Folder name" });
 *   await alertDialog({ message: "Something went wrong." });
 */

type DialogKind = "confirm" | "prompt" | "alert";

interface DialogRequest {
  kind: DialogKind;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  placeholder?: string;
  defaultValue?: string;
  resolve: (value: boolean | string | null) => void;
}

interface DialogState {
  current: DialogRequest | null;
  open: (req: DialogRequest) => void;
  close: () => void;
}

const useDialogStore = create<DialogState>((set) => ({
  current: null,
  open: (req) => set({ current: req }),
  close: () => set({ current: null }),
}));

function request(req: Omit<DialogRequest, "resolve">): Promise<boolean | string | null> {
  return new Promise((resolve) => {
    useDialogStore.getState().open({ ...req, resolve });
  });
}

export async function confirmDialog(opts: {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return (await request({ kind: "confirm", ...opts })) === true;
}

export async function promptDialog(opts: {
  title?: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
}): Promise<string | null> {
  const res = await request({ kind: "prompt", ...opts });
  return typeof res === "string" ? res : null;
}

export async function alertDialog(opts: {
  title?: string;
  message?: string;
  confirmLabel?: string;
}): Promise<void> {
  await request({ kind: "alert", ...opts });
}

/** Render once near the app root. Shows whatever dialog is currently requested. */
export function DialogHost() {
  const current = useDialogStore((s) => s.current);
  const close = useDialogStore((s) => s.close);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (current?.kind === "prompt") {
      setValue(current.defaultValue ?? "");
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [current]);

  if (!current) return null;

  const settle = (result: boolean | string | null) => {
    current.resolve(result);
    close();
  };

  const onCancel = () =>
    settle(current.kind === "prompt" ? null : false);

  const onConfirm = () => {
    if (current.kind === "prompt") settle(value);
    else settle(true);
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <div className="dialog" role="dialog" aria-modal onMouseDown={(e) => e.stopPropagation()}>
        {current.title && <h3 className="dialog-title">{current.title}</h3>}
        {current.message && <p className="dialog-message">{current.message}</p>}

        {current.kind === "prompt" && (
          <input
            ref={inputRef}
            className="dialog-input"
            value={value}
            placeholder={current.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onConfirm();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancel();
              }
            }}
          />
        )}

        <div className="dialog-actions">
          {current.kind !== "alert" && (
            <button className="btn ghost" onClick={onCancel}>
              {current.cancelLabel ?? "Cancel"}
            </button>
          )}
          <button
            className={`btn ${current.danger ? "danger-solid" : "primary"}`}
            onClick={onConfirm}
            autoFocus={current.kind !== "prompt"}
          >
            {current.confirmLabel ?? (current.kind === "alert" ? "OK" : "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
