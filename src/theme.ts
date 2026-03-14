// Design tokens — all colors and sizing in one place
export const theme = {
  colors: {
    // Backgrounds
    bg: "#fafafa",
    bgSidebar: "#f4f4f5",
    bgHover: "#ebebec",
    bgSelected: "#e4e4e7",

    // Borders
    border: "#e4e4e7",
    borderStrong: "#d4d4d8",

    // Text
    text: "#18181b",
    textMuted: "#71717a",
    textFaint: "#a1a1aa",

    // Accent
    accent: "#6366f1",
    accentLight: "rgba(99, 102, 241, 0.12)",

    // Status bar
    statusBg: "#18181b",
    statusText: "#a1a1aa",
  },
  font: {
    ui: "system-ui, -apple-system, sans-serif",
    editor: "'Georgia', 'Times New Roman', serif",
    mono: "'Fira Code', 'JetBrains Mono', monospace",
  },
  size: {
    sidebar: "240px",
    statusBar: "28px",
  },
} as const;
