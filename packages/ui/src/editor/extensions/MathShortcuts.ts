import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { EDIT_MATH_EVENT, type EditMathDetail } from "../MathNode";

/**
 * LaTeX entry shortcuts inside the editor:
 *  - Typing `$$` inserts an empty block formula and opens the LaTeX editor with
 *    the cursor ready (the "起手式" auto-complete).
 *  - Typing `$ ... $` converts the run to an inline formula on the closing `$`.
 *
 * Bracket auto-closing for ( [ { etc. is handled by the AutoPair extension.
 */
export const MathShortcuts = Extension.create({
  name: "mathShortcuts",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("mathShortcuts"),
        props: {
          handleTextInput(view, from, to, text) {
            if (text !== "$") return false;
            const { state } = view;
            const blockMath = state.schema.nodes.blockMath;
            const inlineMath = state.schema.nodes.inlineMath;

            // `$$` -> empty block formula, then open the editor dialog.
            const before = state.doc.textBetween(from - 1, from);
            if (before === "$" && blockMath) {
              const node = blockMath.create({ latex: "" });
              view.dispatch(state.tr.replaceRangeWith(from - 1, to, node));
              const pos = from - 1;
              requestAnimationFrame(() => {
                view.dom.dispatchEvent(
                  new CustomEvent<EditMathDetail>(EDIT_MATH_EVENT, {
                    bubbles: true,
                    detail: { pos, latex: "", display: true },
                  }),
                );
              });
              return true;
            }

            // `$...$` -> inline formula on the closing dollar.
            if (inlineMath) {
              const $from = state.doc.resolve(from);
              const start = $from.start();
              const textBefore = state.doc.textBetween(start, from, undefined, "￼");
              const idx = textBefore.lastIndexOf("$");
              if (idx >= 0) {
                const latex = textBefore.slice(idx + 1);
                if (latex.length > 0 && !latex.includes("￼")) {
                  const dollarPos = start + idx;
                  const node = inlineMath.create({ latex });
                  view.dispatch(state.tr.replaceRangeWith(dollarPos, to, node));
                  return true;
                }
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});
