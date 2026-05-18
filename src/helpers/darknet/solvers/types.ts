import type { DarknetHostname } from '/helpers/darknet/types.js';

export type DarknetSolverResult = {
  hostname: DarknetHostname;
  modelId: string;
  guessed: boolean;
  success: boolean;
  password?: string;
  message?: string;
  shouldCaptureHeartbleed?: boolean;
};
