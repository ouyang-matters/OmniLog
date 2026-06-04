import { Node, mergeAttributes } from "@tiptap/core";
import katex from "katex";

/**
 * Event dispatched by a math node's view when the user double-clicks it. The
 * editor container listens for this and opens the LaTeX editor dialog. Using a
 * DOM event keeps the node views decoupled from React state.
 */
export interface EditMathDetail {
  pos: number;
  latex: string;
  display: boolean;
}

export const EDIT_MATH_EVENT = "omnilog:edit-math";

function renderInto(el: HTMLElement, latex: string, displayMode: boolean) {
  if (!latex.trim()) {
    el.textContent = displayMode ? "Empty formula" : "( )";
    el.classList.add("math-empty");
    return;
  }
  el.classList.remove("math-empty");
  try {
    // throwOnError:false means KaTeX never throws - on a parse error it renders
    // the offending source in red instead of crashing the editor.
    katex.render(latex, el, {
      displayMode,
      throwOnError: false,
      errorColor: "#e5484d",
    });
  } catch {
    // Last-resort guard: keep the raw LaTeX visible rather than blanking out.
    el.textContent = latex;
    el.classList.add("math-error");
  }
}

function buildView(displayMode: boolean) {
  return (props: { node: { attrs: { latex: string } }; getPos: () => number | undefined }) => {
    const dom = document.createElement(displayMode ? "div" : "span");
    dom.className = displayMode ? "math-block" : "math-inline";
    dom.setAttribute("contenteditable", "false");
    renderInto(dom, props.node.attrs.latex, displayMode);

    dom.addEventListener("dblclick", (e) => {
      e.preventDefault();
      const pos = props.getPos();
      if (pos === undefined) return;
      dom.dispatchEvent(
        new CustomEvent<EditMathDetail>(EDIT_MATH_EVENT, {
          bubbles: true,
          detail: { pos, latex: props.node.attrs.latex, display: displayMode },
        }),
      );
    });

    return {
      dom,
      update: (updatedNode: { type: { name: string }; attrs: { latex: string } }) => {
        if (updatedNode.type.name !== (displayMode ? "blockMath" : "inlineMath")) {
          return false;
        }
        renderInto(dom, updatedNode.attrs.latex, displayMode);
        return true;
      },
    };
  };
}

export const InlineMath = Node.create({
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-latex") ?? "",
        renderHTML: (attrs) => ({ "data-latex": attrs.latex }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-inline-math]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-inline-math": "" }),
      HTMLAttributes["data-latex"] ?? "",
    ];
  },

  addNodeView() {
    return buildView(false) as never;
  },
});

export const BlockMath = Node.create({
  name: "blockMath",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-latex") ?? "",
        renderHTML: (attrs) => ({ "data-latex": attrs.latex }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-block-math]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-block-math": "" }),
      HTMLAttributes["data-latex"] ?? "",
    ];
  },

  addNodeView() {
    return buildView(true) as never;
  },
});
