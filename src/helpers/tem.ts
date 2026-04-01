import type { NS } from '@ns';
import type { CSSProperties } from 'react';

type TailTitleContent = Parameters<NS['ui']['setTailTitle']>[0];

export function tem(text: string, colorOrStyle: string | CSSProperties = 'rainbow'): TailTitleContent {
  const React = globalThis.React;
  const eleMaker = (t: string, style: CSSProperties) => React.createElement('span', { style }, t);
  const spans: React.ReactElement[] = [];

  if (typeof colorOrStyle === 'string') {
    if (colorOrStyle === 'rainbow') {
      text.split('').forEach((l) =>
        spans.push(
          eleMaker(l, {
            color: `rgb(${Math.random() * 255},${Math.random() * 255},${Math.random() * 255})`,
          }),
        ),
      );
    } else {
      spans.push(eleMaker(text, { color: colorOrStyle }));
    }
    return React.createElement('span', null, ...spans);
  }

  const { color, ...rest } = colorOrStyle;
  if (color === undefined || color === 'rainbow') {
    text.split('').forEach((l) =>
      spans.push(
        eleMaker(l, {
          ...rest,
          color: `rgb(${Math.random() * 255},${Math.random() * 255},${Math.random() * 255})`,
        }),
      ),
    );
  } else {
    spans.push(eleMaker(text, colorOrStyle));
  }

  return React.createElement('span', null, ...spans);
}
