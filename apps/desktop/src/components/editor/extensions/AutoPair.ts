import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";

/**
 * Auto-close brackets and quotes, for both ASCII and CJK punctuation:
 *   ( ) [ ] { }  （ ）【 】「 」『 』《 》  " "  ' '  ` `  " "  ' '
 *
 * Behaviour:
 *  - Type an opener -> inserts the matching closer, cursor between them.
 *  - Type an opener with a selection -> wraps the selection.
 *  - Type a closer when the next char is that same closer -> steps over it.
 *  - Backspace between an empty pair -> deletes both characters.
 */
const PAIRS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  "（": "）",
  "【": "】",
  "「": "」",
  "『": "』",
  "《": "》",
  "“": "”",
  "‘": "’",
  '"': '"',
  "'": "'",
  "`": "`",
};
const CLOSERS = new Set(Object.values(PAIRS));

export const AutoPair = Extension.create({
  name: "autoPair",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("autoPair"),
        props: {
          handleTextInput(view, from, to, text) {
            const { state } = view;
            const close = PAIRS[text];

            // Step over an existing closer (e.g. typing ")" right before ")").
            if (CLOSERS.has(text)) {
              const after = state.doc.textBetween(to, to + 1);
              if (after === text) {
                view.dispatch(
                  state.tr.setSelection(TextSelection.create(state.doc, to + 1)),
                );
                return true;
              }
            }

            if (!close) return false;

            // Wrap a non-empty selection.
            const { selection } = state;
            if (!selection.empty) {
              const { from: sf, to: st } = selection;
              const tr = state.tr.insertText(close, st).insertText(text, sf);
              tr.setSelection(
                TextSelection.create(tr.doc, sf + text.length, st + text.length),
              );
              view.dispatch(tr.scrollIntoView());
              return true;
            }

            // Insert the pair and place the cursor between.
            const tr = state.tr.insertText(text + close, from, to);
            tr.setSelection(TextSelection.create(tr.doc, from + text.length));
            view.dispatch(tr.scrollIntoView());
            return true;
          },

          handleKeyDown(view, event) {
            if (event.key !== "Backspace") return false;
            const { state } = view;
            const { empty, $head } = state.selection;
            if (!empty) return false;
            const before = state.doc.textBetween($head.pos - 1, $head.pos);
            const after = state.doc.textBetween($head.pos, $head.pos + 1);
            if (before && PAIRS[before] === after) {
              view.dispatch(state.tr.delete($head.pos - 1, $head.pos + 1));
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});
