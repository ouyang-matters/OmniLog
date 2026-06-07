/**
 * Monochrome line icons. All use `currentColor`, so they take the colour of
 * surrounding text (single-colour, no multi-colour emoji).
 */
export type IconName =
  | "note"
  | "folder"
  | "rename"
  | "move"
  | "trash"
  | "home"
  | "back"
  | "settings"
  | "plus"
  | "official"
  | "server"
  | "offline";

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "note":
      return (
        <svg {...common}>
          <path d="M5 3h9l5 5v13a0 0 0 0 1 0 0H5a0 0 0 0 1 0 0V3z" />
          <path d="M14 3v5h5" />
          <path d="M8 13h8M8 17h6" />
        </svg>
      );
    case "folder":
      return (
        <svg {...common}>
          <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h7A1.5 1.5 0 0 1 19 9v8.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5v-11z" />
        </svg>
      );
    case "rename":
      return (
        <svg {...common}>
          <path d="M4 20h16" />
          <path d="M14.5 4.5l5 5L9 20l-5 1 1-5L14.5 4.5z" />
        </svg>
      );
    case "move":
      return (
        <svg {...common}>
          <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5v-10z" />
          <path d="M9 13h6M13 11l2 2-2 2" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M9 7V5h6v2" />
          <path d="M6 7l1 13h10l1-13" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      );
    case "home":
      return (
        <svg {...common}>
          <path d="M4 11l8-7 8 7" />
          <path d="M6 9.5V20h12V9.5" />
        </svg>
      );
    case "back":
      return (
        <svg {...common}>
          <path d="M15 5l-7 7 7 7" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
        </svg>
      );
    case "official":
      return (
        <svg {...common}>
          <path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 21l-4.9 2.6.9-5.5-4-3.9 5.5-.8L12 3z" />
        </svg>
      );
    case "server":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="7" rx="1.5" />
          <rect x="3" y="13" width="18" height="7" rx="1.5" />
          <path d="M7 7.5h.01M7 16.5h.01" />
        </svg>
      );
    case "offline":
      return (
        <svg {...common}>
          <path d="M12 3a9 9 0 1 0 9 9" />
          <path d="M12 8v4l3 2" />
          <path d="M18 3l3 3-3 3" />
        </svg>
      );
  }
}
