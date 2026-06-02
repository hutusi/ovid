const platform = typeof navigator !== "undefined" ? navigator.platform : "";

export const isMac = platform.startsWith("Mac");
export const isWindows = platform.startsWith("Win");
export const isLinux = platform.startsWith("Linux");
