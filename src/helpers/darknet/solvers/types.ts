import type { DarknetHostname } from '/helpers/darknet/types.js';

export type DarknetSolverResult = {
  hostname: DarknetHostname;
  modelId: string;
  attempted: boolean;
  success: boolean;
  password?: string;
  message?: string;
  shouldCaptureHeartbleed?: boolean;
};

