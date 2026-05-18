/**
 * Bitburner v3+ shows infiltration difficulty on the colored bar as roughly
 * `ns.infiltration.getInfiltration(loc).difficulty` times {@link INFILTRATION_DIFFICULTY_UI_MULTIPLIER}.
 * That matches the former 0–100 bar scale at ~100 for API difficulty 3.5; the bar can exceed 100 now.
 * (Community formula: multiply API difficulty by ~28.57, i.e. {@link INFILTRATION_DIFFICULTY_UI_MULTIPLIER}.)
 */
export const INFILTRATION_DIFFICULTY_UI_MULTIPLIER = 100 / 3.5;

/** `getInfiltration().difficulty` at which the UI-equivalent bar is ~100. */
export const INFILTRATION_API_DIFFICULTY_AT_UI_100 = 100 / INFILTRATION_DIFFICULTY_UI_MULTIPLIER;

export function toInfiltrationUiDifficulty(apiDifficulty: number): number {
  return apiDifficulty * INFILTRATION_DIFFICULTY_UI_MULTIPLIER;
}
