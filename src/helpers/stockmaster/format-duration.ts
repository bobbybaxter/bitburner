// Format a duration (in milliseconds) as e.g. '1h 21m 6s' for big durations or e.g '12.5s' / '23ms' for small durations
export function formatDuration(duration: number): string {
  if (duration < 1000) return `${duration.toFixed(0)}ms`;
  if (!isFinite(duration)) return 'forever (Infinity)';
  const portions = [];
  const msInHour = 1000 * 60 * 60;
  const hours = Math.trunc(duration / msInHour);
  if (hours > 0) {
    portions.push(hours + 'h');
    duration -= hours * msInHour;
  }
  const msInMinute = 1000 * 60;
  const minutes = Math.trunc(duration / msInMinute);
  if (minutes > 0) {
    portions.push(minutes + 'm');
    duration -= minutes * msInMinute;
  }
  const secondsNum = duration / 1000.0;
  // Include millisecond precision if we're on the order of seconds
  const secondsStr = hours === 0 && minutes === 0 ? secondsNum.toPrecision(3) : secondsNum.toFixed(0);
  if (secondsNum > 0) {
    portions.push(secondsStr + 's');
  }
  return portions.join(' ');
}
