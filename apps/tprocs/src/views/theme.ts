const palette = {
  white: "#FFFFFF",
  black: "#000000",
  gray950: "#141414",
  gray900: "#1f2937",
  gray800: "#333333",
  gray400: "#9ca3af",

  green: "#99FFE4",
  greenBg: "#1F3F39",
  greenSoft: "#d1fae5",
  red: "#FF8080",
  redBg: "#3F1F25",
  yellow: "#FFC799",
  yellowBg: "#3F311F",
  blue: "#7DD3FC",
  blueBg: "#0E2A3F",
} as const;

export const theme = {
  // Foregrounds
  fg: palette.white,
  fgDim: palette.gray400,
  fgActive: palette.green,

  // Surfaces
  bg: palette.black,
  bgPanel: palette.gray950, // procs-list, status-bar
  bgRow: palette.gray800, // selected row, neutral chip

  // Borders
  borderActive: palette.white,
  borderHover: palette.gray400,
  borderFocus: palette.green,
  borderIdle: "transparent",

  // Semantic accent pairs (status badges, mode chip, accents)
  green: palette.green,
  greenBg: palette.greenBg,
  red: palette.red,
  redBg: palette.redBg,
  yellow: palette.yellow,
  yellowBg: palette.yellowBg,
  blue: palette.blue,
  blueBg: palette.blueBg,

  // Toast
  toastFg: palette.greenSoft,
  toastBg: palette.gray900,
} as const;
