/** ANSI color codes for terminal output */
export const c = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  red:    "\x1b[0;31m",
  green:  "\x1b[0;32m",
  yellow: "\x1b[1;33m",
  blue:   "\x1b[0;34m",
  cyan:   "\x1b[0;36m",
  orange: "\x1b[0;33m",
  gray:   "\x1b[0;90m",
} as const;

/** Wrap text in a color, resetting after */
export function color(code: string, text: string): string {
  return `${code}${text}${c.reset}`;
}

export const red    = (t: string) => color(c.red, t);
export const green  = (t: string) => color(c.green, t);
export const yellow = (t: string) => color(c.yellow, t);
export const blue   = (t: string) => color(c.blue, t);
export const cyan   = (t: string) => color(c.cyan, t);
export const orange = (t: string) => color(c.orange, t);
export const gray   = (t: string) => color(c.gray, t);
export const bold   = (t: string) => color(c.bold, t);
