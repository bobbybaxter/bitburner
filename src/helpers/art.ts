export function art(x: string, style: { color?: number; background?: number; bold?: boolean; underline?: boolean }) {
  // x = what you want colored
  const o = {
    // accepts style as an object, all options are optional
    color: !isNaN(style.color ?? -1) ? style.color : -1, // style.color uses 256 color codes
    background: !isNaN(style.background ?? -1) ? style.background : -1, // style.background 256 color codes aswell
    bold: style.bold ? true : false, // style.bold is boolean true for bold else false
    underline: style.underline ? true : false, // style.underline is boolean true for underline else false
  };
  return `\x1b[${o?.color && o.color >= 0 ? `38;5;${o.color}` : null}${o.bold ? ';1' : null}${
    o.underline ? ';4' : null
  }${o?.background && o.background >= 0 ? `;48;5;${o.background}` : null}m${x}\x1b[0m`;
}
