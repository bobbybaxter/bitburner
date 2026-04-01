import { art } from './art';

export function bar(progress: number, bar: string = '#', length: number = 15) {
  const empty = ' ';
  const progressValue = Math.min(progress, 1);
  const barProgress = Math.floor(progressValue * length);
  const colors = [196, 202, 226, 46, 33];
  const fullColor = 255;
  const categoryValue = Math.min(colors.length - 1, Math.floor(progressValue * colors.length));
  const color = progressValue < 1 ? colors[categoryValue] : fullColor;
  const array = new Array(barProgress).fill(bar).concat(new Array(length - barProgress).fill(empty));
  return `[${art(array.join(''), { color })}]`;
}
