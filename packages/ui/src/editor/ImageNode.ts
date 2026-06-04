import { Node, mergeAttributes } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { getClient } from "../context";

/**
 * Custom image node. The persisted `contentJson` stores a stable `assetId`
 * (and a `asset://<id>` src sentinel) rather than a transient blob URL, so an
 * entry reopens correctly in a later session. The node view fetches the binary
 * with auth and shows it via an object URL.
 */
export const ASSET_SRC_PREFIX = "asset://";

const objectUrlCache = new Map<string, string>();

/** Pre-seed the object-URL cache (e.g. right after an upload) to avoid a refetch. */
export function cacheAssetUrl(assetId: string, url: string): void {
  objectUrlCache.set(assetId, url);
}

async function resolveAssetUrl(assetId: string): Promise<string | null> {
  if (objectUrlCache.has(assetId)) return objectUrlCache.get(assetId)!;
  const client = getClient();
  if (!client) return null;
  try {
    const blob = await client.getAssetBlob(assetId);
    const url = URL.createObjectURL(blob);
    objectUrlCache.set(assetId, url);
    return url;
  } catch {
    return null;
  }
}

export const ImageNode = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      assetId: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-asset-id"),
        renderHTML: (attrs) => (attrs.assetId ? { "data-asset-id": attrs.assetId } : {}),
      },
      src: { default: null },
      width: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-width"),
        renderHTML: (attrs) => (attrs.width ? { "data-width": attrs.width } : {}),
      },
      caption: {
        default: "",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-caption") ?? "",
        renderHTML: (attrs) => (attrs.caption ? { "data-caption": attrs.caption } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-image]" }, { tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const { src, caption } = HTMLAttributes as Record<string, string>;
    return [
      "figure",
      mergeAttributes({ "data-image": "" }, HTMLAttributes),
      ["img", { src: src ?? "" }],
      ["figcaption", {}, caption ?? ""],
    ];
  },

  addNodeView() {
    return (props) => {
      const editor = props.editor as Editor;
      const getPos = props.getPos as () => number | undefined;
      let attrs = props.node.attrs as {
        assetId: string | null;
        src: string | null;
        width: string | number | null;
        caption: string;
      };

      const figure = document.createElement("figure");
      figure.className = "image-figure";
      figure.setAttribute("contenteditable", "false");

      const img = document.createElement("img");
      img.alt = attrs.caption || "";
      figure.appendChild(img);

      const caption = document.createElement("figcaption");
      caption.className = "image-caption";
      figure.appendChild(caption);

      const controls = document.createElement("div");
      controls.className = "image-controls";
      figure.appendChild(controls);

      function setAttrs(patch: Partial<typeof attrs>) {
        const pos = getPos();
        if (pos === undefined) return;
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, { ...attrs, ...patch });
            return true;
          })
          .run();
      }

      function applyWidth(w: number | null) {
        img.style.width = w ? `${w}%` : "";
      }

      function render() {
        applyWidth(attrs.width ? Number(attrs.width) : null);
        caption.textContent = attrs.caption || "";
        caption.style.display = attrs.caption ? "" : "none";
        img.alt = attrs.caption || "";
      }

      // Resolve the actual image bytes.
      function loadImage() {
        if (attrs.src && !attrs.src.startsWith(ASSET_SRC_PREFIX)) {
          img.src = attrs.src;
        } else if (attrs.assetId) {
          img.classList.add("loading");
          void resolveAssetUrl(attrs.assetId).then((url) => {
            img.classList.remove("loading");
            if (url) img.src = url;
            else img.alt = "[image unavailable offline]";
          });
        }
      }

      // Hover controls: resize presets, caption, delete.
      for (const [label, w] of [["S", 25], ["M", 50], ["L", 75], ["Full", 100]] as const) {
        const b = document.createElement("button");
        b.textContent = label;
        b.className = "img-ctrl";
        b.addEventListener("click", (e) => {
          e.preventDefault();
          attrs = { ...attrs, width: w };
          applyWidth(w);
          setAttrs({ width: w });
        });
        controls.appendChild(b);
      }
      const capBtn = document.createElement("button");
      capBtn.textContent = "Caption";
      capBtn.className = "img-ctrl";
      capBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const next = window.prompt("Image caption", attrs.caption || "");
        if (next !== null) {
          attrs = { ...attrs, caption: next };
          render();
          setAttrs({ caption: next });
        }
      });
      controls.appendChild(capBtn);

      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete";
      delBtn.className = "img-ctrl danger";
      delBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const pos = getPos();
        if (pos === undefined) return;
        const client = getClient();
        if (attrs.assetId && client) void client.deleteAsset(attrs.assetId).catch(() => {});
        editor
          .chain()
          .command(({ tr }) => {
            tr.delete(pos, pos + 1);
            return true;
          })
          .run();
      });
      controls.appendChild(delBtn);

      render();
      loadImage();

      return {
        dom: figure,
        update: (updated) => {
          if (updated.type.name !== "image") return false;
          const prevAsset = attrs.assetId;
          attrs = updated.attrs as typeof attrs;
          render();
          if (attrs.assetId !== prevAsset) loadImage();
          return true;
        },
      };
    };
  },
});
