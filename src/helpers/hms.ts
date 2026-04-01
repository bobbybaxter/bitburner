export function dhms(t: number) {
  // t is in ms
  const cd = 24 * 60 * 60 * 1000;
  const pad = (n: number) => (n < 10 ? '0' + n : n);
  const ch = 60 * 60 * 1000;
  const cm = 60 * 1000;
  let d = Math.floor(t / cd);
  let h = Math.floor((t - d * cd) / ch);
  let m = Math.floor((t - d * cd - h * ch) / cm);
  let s = Math.round((t - d * cd - h * ch - m * cm) / 1000);
  if (s === 60) {
    m++;
    s = 0;
  }
  if (m === 60) {
    h++;
    m = 0;
  }
  if (h === 24) {
    d++;
    h = 0;
  }
  return [d, pad(h), pad(m), pad(s)].join(':');
}

export function hms(t: number) {
  // t is in ms
  const ch = 60 * 60 * 1000;
  const cm = 60 * 1000;
  const pad = (n: number) => (n < 10 ? '0' + n : n);
  let h = Math.floor(t / ch);
  let m = Math.floor((t - h * ch) / cm);
  let s = Math.round((t - h * ch - m * cm) / 1000);
  if (s === 60) {
    m++;
    s = 0;
  }
  if (m === 60) {
    h++;
    m = 0;
  }
  return [pad(h), pad(m), pad(s)].join(':');
}

export function hmsms(t: number) {
  // t is in ms
  const ch = 60 * 60 * 1000;
  const cm = 60 * 1000;
  const pad = (n: number) => (n < 10 ? '0' + n : n);
  const msPad = (n: number) => (n.toString().length < 3 ? '0'.repeat(3 - n.toString().length) + n : n);
  let h = Math.floor(t / ch);
  let m = Math.floor((t - h * ch) / cm);
  let s = Math.floor((t - h * ch - m * cm) / 1000);
  let ms = Math.round(t - h * ch - m * cm - s * 1000);

  if (ms === 1000) {
    s++;
    ms = 0;
  }
  if (s === 60) {
    m++;
    s = 0;
  }
  if (m === 60) {
    h++;
    m = 0;
  }
  return [pad(h), pad(m), pad(s), msPad(ms)].join(':');
}
