import { useMemo } from "react";
import { useApp } from "../../store/appStore";
import type { Draft } from "../../lib/drafts";
import { SourceEditor } from "./SourceEditor";
import { renderLatexDocument, katexMath } from "./sourceRender";

/**
 * LaTeX editor. The whole document is a LaTeX source string in `contentText`;
 * `$$...$$` are block formulas, `$...$` inline, everything else is prose. The
 * preview renders with KaTeX. Switching to rich converts it (see store.setMode).
 */
interface Props {
  draft: Draft;
}

const PLACEHOLDER =
  "Type LaTeX. Block formulas in $$ ... $$, inline in $ ... $.\nExample:\n\nThe Ito integral is\n\n$$ \\int_0^t f(s)\\, dW_s $$";

export function LatexEditor({ draft }: Props) {
  const patchCurrent = useApp((s) => s.patchCurrent);
  const value = draft.contentText;
  const html = useMemo(() => renderLatexDocument(value, katexMath), [value]);

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
