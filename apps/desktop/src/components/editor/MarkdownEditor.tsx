import { useMemo } from "react";
import { useApp } from "../../store/appStore";
import type { Draft } from "../../lib/drafts";
import { SourceEditor } from "./SourceEditor";
import { renderMarkdown, katexMath } from "./sourceRender";

/**
 * Markdown editor. The source string in `contentText` is canonical; the live
 * preview renders it with a small Markdown + KaTeX renderer. Switching to rich
 * mode converts this source into a real rich document (see store.setMode).
 */
interface Props {
  draft: Draft;
}

const PLACEHOLDER =
  "# Heading\n\nMarkdown with inline math like $x^2 + y^2$ and block math:\n\n$$\n\\int_0^1 x\\,dx = \\tfrac{1}{2}\n$$\n\n- bullet\n- list\n\n`code`, **bold**, *italic*, [links](https://example.com).";

export function MarkdownEditor({ draft }: Props) {
  const patchCurrent = useApp((s) => s.patchCurrent);
  const value = draft.contentText;
  const html = useMemo(() => renderMarkdown(value, katexMath), [value]);

  return (
    <SourceEditor
      value={value}
      placeholder={PLACEHOLDER}
      previewHtml={html}
      resetKey={draft.id}
      onChange={(next) => patchCurrent({ contentText: next })}
    />
  );
}
