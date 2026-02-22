export function localISOString() {
  const now = new Date();
  const offsetMinutes = now.getTimezoneOffset();
  const adjustedTime = new Date(now.getTime() - offsetMinutes * 60000);
  return adjustedTime.toISOString().slice(0, 19).replace('T', ' ');
}
