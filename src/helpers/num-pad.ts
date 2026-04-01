export function numPad(value: number, digits: number) {
  return value.toString().length < digits ? '0'.repeat(digits - value.toString().length) + value : value.toString();
}
