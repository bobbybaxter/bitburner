import { CorpIndustryData } from '@ns';
import { CorpMaterialsData } from '../../constants/corp';
import { boostMaterials } from './corporation-utils';

export function getOptimalBoostMaterialQuantities(
  industryData: CorpIndustryData,
  spaceConstraint: number,
  round: boolean = true,
): number[] {
  const { aiCoreFactor, hardwareFactor, realEstateFactor, robotFactor } = industryData;
  const boostMaterialCoefficients = [aiCoreFactor!, hardwareFactor!, realEstateFactor!, robotFactor!];
  const boostMaterialSizes = boostMaterials.map((mat) => CorpMaterialsData[mat].size);

  const calculateOptimalQuantities = (matCoefficients: number[], matSizes: number[]): number[] => {
    const sumOfCoefficients = matCoefficients.reduce((a, b) => a + b, 0);
    const sumOfSizes = matSizes.reduce((a, b) => a + b, 0);
    const result = [];
    for (let i = 0; i < matSizes.length; ++i) {
      let matCount =
        (spaceConstraint -
          500 *
            ((matSizes[i] / matCoefficients[i]) * (sumOfCoefficients - matCoefficients[i]) -
              (sumOfSizes - matSizes[i]))) /
        (sumOfCoefficients / matCoefficients[i]) /
        matSizes[i];
      if (matCoefficients[i] <= 0 || matCount < 0) {
        return calculateOptimalQuantities(matCoefficients.toSpliced(i, 1), matSizes.toSpliced(i, 1)).toSpliced(i, 0, 0);
      } else {
        if (round) {
          matCount = Math.round(matCount);
        }
        result.push(matCount);
      }
    }
    return result;
  };
  return calculateOptimalQuantities(boostMaterialCoefficients, boostMaterialSizes);
}
