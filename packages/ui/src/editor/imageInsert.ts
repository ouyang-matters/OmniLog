import type { Editor } from "@tiptap/core";
import { getClient, getAppState, type PlatformUI } from "../context";
import { ASSET_SRC_PREFIX, cacheAssetUrl } from "./ImageNode";

/** Upload a single image file to the server and insert it into the editor. */
export async function uploadAndInsert(editor: Editor, file: Blob, fileName: string) {
  const client = getClient();
  const entryId = getAppState()?.currentId;
  if (!client || !entryId) {
    alert("Connect to a server before adding images.");
    return;
  }
  try {
    const asset = await client.uploadImage({ entryId, file, fileName });
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
    alert(
      "Image upload failed: " +
        (e instanceof Error ? e.message : "server unreachable"),
    );
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

/** Open the OS file picker, read the chosen image, and insert it.
 *  Receives PlatformUI from the calling React component. */
export async function pickAndInsertImage(editor: Editor, platformUI: PlatformUI) {
  if (!platformUI.pickFile) return;
  const result = await platformUI.pickFile({
    title: "Choose an image",
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
  });
  if (!result) return;
  const ext = result.name.split(".").pop()?.toLowerCase() ?? "png";
  const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  const blob = new Blob([result.bytes.buffer as ArrayBuffer], { type: mime });
  await uploadAndInsert(editor, blob, result.name);
}
