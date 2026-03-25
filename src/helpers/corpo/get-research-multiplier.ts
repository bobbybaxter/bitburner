import { CorpResearchesData } from '../../constants/corp';
import { DivisionResearches, ResearchName } from './types';

export function getResearchMultiplier(
  divisionResearches: DivisionResearches,
  researchDataKey: keyof (typeof CorpResearchesData)[string],
): number {
  let multiplier = 1;
  for (const [researchName, researchData] of Object.entries(CorpResearchesData)) {
    if (!divisionResearches[<ResearchName>researchName]) {
      continue;
    }
    const researchDataValue = researchData[researchDataKey];
    if (!Number.isFinite(researchDataValue)) {
      throw new Error(`Invalid researchDataKey: ${researchDataKey}`);
    }
    multiplier *= researchDataValue as number;
  }
  return multiplier;
}

export function getResearchSalesMultiplier(divisionResearches: DivisionResearches): number {
  return getResearchMultiplier(divisionResearches, 'salesMult');
}

export function getResearchAdvertisingMultiplier(divisionResearches: DivisionResearches): number {
  return getResearchMultiplier(divisionResearches, 'advertisingMult');
}

export function getResearchRPMultiplier(divisionResearches: DivisionResearches): number {
  return getResearchMultiplier(divisionResearches, 'sciResearchMult');
}

export function getResearchStorageMultiplier(divisionResearches: DivisionResearches): number {
  return getResearchMultiplier(divisionResearches, 'storageMult');
}

export function getResearchEmployeeCreativityMultiplier(divisionResearches: DivisionResearches): number {
  return getResearchMultiplier(divisionResearches, 'employeeCreMult');
}

export function getResearchEmployeeCharismaMultiplier(divisionResearches: DivisionResearches): number {
  return getResearchMultiplier(divisionResearches, 'employeeChaMult');
}

export function getResearchEmployeeIntelligenceMultiplier(divisionResearches: DivisionResearches): number {
  return getResearchMultiplier(divisionResearches, 'employeeIntMult');
}

export function getResearchEmployeeEfficiencyMultiplier(divisionResearches: DivisionResearches): number {
  return getResearchMultiplier(divisionResearches, 'productionMult');
}
