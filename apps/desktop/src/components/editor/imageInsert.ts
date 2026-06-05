import type { Editor } from "@tiptap/core";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getClient } from "../../store/appStore";
import { useApp } from "../../store/appStore";
import { ASSET_SRC_PREFIX, cacheAssetUrl } from "./ImageNode";
import { alertDialog } from "../../ui/dialog";

/** Upload a single image file to the server and insert it into the editor. */
export async function uploadAndInsert(editor: Editor, file: Blob, fileName: string) {
  const client = getClient();
  const entryId = useApp.getState().currentId;
  if (!client || !entryId) {
    await alertDialog({ message: "Connect to a server before adding images." });
    return;
  }
  try {
    const asset = await client.uploadImage({ entryId, file, fileName });
    // Seed the cache with the bytes we already have so the image shows instantly.
    cacheAssetUrl(asset._id, URL.createObjectURL(file));
    editor
      .chain()
      .focus()
      .insertContent({
        type: "image",
        attrs: {
          assetId: asset._id,
          src: `${ASSET_SRC_PREFIX}${asset._id}`,
          width: null,
          caption: asset.caption ?? "",
        },
      })
      .run();
  } catch (e) {
    await alertDialog({
      title: "Image upload failed",
      message: e instanceof Error ? e.message : "server unreachable",
    });
  }
}

/** Extract image files from a clipboard/drag event and insert them. */
export function insertImagesFromFiles(editor: Editor, files: FileList | File[]): boolean {
  const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
  if (images.length === 0) return false;
  for (const file of images) {
    void uploadAndInsert(editor, file, file.name || "pasted-image.png");
  }
  return true;
}

/** Open the OS file picker, read the chosen image, and insert it. */
export async function pickAndInsertImage(editor: Editor) {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
  });
  if (!selected || typeof selected !== "string") return;
  // Read via our Rust command (the dialog already authorized this exact path).
  const bytes = new Uint8Array(await invoke<number[]>("read_file_bytes", { path: selected }));
  const name = selected.split(/[/\\]/).pop() || "image.png";
  const ext = name.split(".").pop()?.toLowerCase() ?? "png";
  const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  const blob = new Blob([bytes], { type: mime });
  await uploadAndInsert(editor, blob, name);
}
