import type { NS } from '@ns';
import { solve2GCellular } from '/helpers/darknet/solvers/2g-cellular.js';
import { solve110100100 } from '/helpers/darknet/solvers/110100100.js';
import { solveAccountsManager42 } from '/helpers/darknet/solvers/accounts-manager-4-2.js';
import { solveBellaCuore } from '/helpers/darknet/solvers/bella-cuore.js';
import { solveBigMoOd } from '/helpers/darknet/solvers/big-mo-od.js';
import { solveCloudBlare } from '/helpers/darknet/solvers/cloud-blare.js';
import { solveDeepGreen } from '/helpers/darknet/solvers/deep-green.js';
import { solveDeskMemo31 } from '/helpers/darknet/solvers/desk-memo-3-1.js';
import { solveEuroZoneFree } from '/helpers/darknet/solvers/euro-zone-free.js';
import { solveFactoriOs } from '/helpers/darknet/solvers/factori-os.js';
import { solveFreshInstall10 } from '/helpers/darknet/solvers/fresh-install-1-0.js';
import { solveKingOfTheHill } from '/helpers/darknet/solvers/king-of-the-hill.js';
import { solveLaika4 } from '/helpers/darknet/solvers/laika4.js';
import { solveMathML } from '/helpers/darknet/solvers/math-ml.js';
import { solveNIL } from '/helpers/darknet/solvers/nil.js';
import { solveOctantVoxel } from '/helpers/darknet/solvers/octant-voxel.js';
import { solveOpenWebAccessPoint } from '/helpers/darknet/solvers/open-web-access-point.js';
import { solveOrdoXenos } from '/helpers/darknet/solvers/ordo-xenos.js';
import { solvePhp54 } from '/helpers/darknet/solvers/php-5-4.js';
import { solvePr0verFl0 } from '/helpers/darknet/solvers/pr0ver-fl0.js';
import { solvePrimeTime2 } from '/helpers/darknet/solvers/prime-time-2.js';
import { solveRateMyPixAuth } from '/helpers/darknet/solvers/rate-my-pix-auth.js';
import { solveTheLabyrinth } from '/helpers/darknet/solvers/the-labyrinth.js';
import { solveTopPass } from '/helpers/darknet/solvers/top-pass.js';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import { solveZeroLogon } from '/helpers/darknet/solvers/zero-logon.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

export async function runSolverForModel(
  ns: NS,
  hostname: DarknetHostname,
  modelId: string,
): Promise<DarknetSolverResult | null> {
  switch (modelId) {
    case '110100100':
      return await solve110100100(ns, hostname);
    case '2G_cellular':
      return await solve2GCellular(ns, hostname);
    case 'BigMo%od':
      return await solveBigMoOd(ns, hostname);
    case 'EuroZone Free':
      return await solveEuroZoneFree(ns, hostname);
    case 'Factori-Os':
      return await solveFactoriOs(ns, hostname);
    case 'KingOfTheHill':
      return await solveKingOfTheHill(ns, hostname);
    case 'MathML':
      return await solveMathML(ns, hostname);
    case 'OrdoXenos':
      return await solveOrdoXenos(ns, hostname);
    case 'PHP 5.4':
      return await solvePhp54(ns, hostname);
    case 'PrimeTime 2':
      return await solvePrimeTime2(ns, hostname);
    case 'RateMyPix.Auth':
      return await solveRateMyPixAuth(ns, hostname);
    case 'TopPass':
      return await solveTopPass(ns, hostname);
    case 'ZeroLogon':
      return await solveZeroLogon(ns, hostname);
    case 'DeskMemo_3.1':
      return await solveDeskMemo31(ns, hostname);
    case 'CloudBlare(tm)':
      return await solveCloudBlare(ns, hostname);
    case 'BellaCuore':
      return await solveBellaCuore(ns, hostname);
    case 'DeepGreen':
      return await solveDeepGreen(ns, hostname);
    case 'FreshInstall_1.0':
      return await solveFreshInstall10(ns, hostname);
    case 'Laika4':
      return await solveLaika4(ns, hostname);
    case 'NIL':
      return await solveNIL(ns, hostname);
    case 'OctantVoxel':
      return await solveOctantVoxel(ns, hostname);
    case 'OpenWebAccessPoint':
      return await solveOpenWebAccessPoint(ns, hostname);
    case 'Pr0verFl0':
      return await solvePr0verFl0(ns, hostname);
    case 'AccountsManager_4.2':
      return await solveAccountsManager42(ns, hostname);
    case '(The Labyrinth)':
      return await solveTheLabyrinth(ns, hostname);
    default:
      return null;
  }
}
