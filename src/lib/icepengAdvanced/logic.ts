// Ported from icepeng/loa-calc (MIT License).
// Source: C:/Users/suri4/Downloads/loa-calc-main.zip
import { AdvancedRefineTable } from './data';

export interface AdvancedRefineReport {
  hasEnhancedBonus: boolean;
  normalBreathNames: string[];
  bonusBreathNames: string[];
  enhancedBonusBreathNames: string[];

  paidNormalTry: number;
  freeNormalTry: number;
  bonusTry: number;
  enhancedBonusTry: number;

  paidNormalPrice: number;
  freeNormalPrice: number;
  bonusPrice: number;
  enhancedBonusPrice: number;

  expectedTryCount: number;
  expectedPrice: number;
  expectedMaterials: { name: string; amount: number }[];
}

function getBasePrice(
  refineTable: AdvancedRefineTable,
  priceTable: Record<string, number>
) {
  return Object.entries(refineTable.amount)
    .map(([name, amount]) => (priceTable[name] ?? 0) * amount)
    .reduce((sum, x) => sum + x, 0);
}

function getSortedBreathByPrice(
  refineTable: AdvancedRefineTable,
  priceTable: Record<string, number>
) {
  return Object.entries(refineTable.breath)
    .map(([name, amount]) => ({
      name,
      amount,
      price: (priceTable[name] ?? 0) * amount,
    }))
    .sort((a, b) => a.price - b.price);
}

function getBookWithPrice(
  refineTable: AdvancedRefineTable,
  priceTable: Record<string, number>
) {
  return refineTable.book
    ? {
        name: refineTable.book,
        amount: 1,
        price: priceTable[refineTable.book] ?? 0,
      }
    : undefined;
}

function getAdditionalPrice(
  refineTable: AdvancedRefineTable,
  priceTable: Record<string, number>,
  breathCount: number,
  bookCount: 0 | 1
) {
  const sortedBreath = getSortedBreathByPrice(refineTable, priceTable);
  const book = getBookWithPrice(refineTable, priceTable);

  return (
    sortedBreath.slice(0, breathCount).reduce((sum, x) => sum + (x?.price ?? 0), 0) +
    (book ? bookCount * (book.price ?? 0) : 0)
  );
}

export function getReport(
  refineTable: AdvancedRefineTable | null | undefined,
  priceTable: Record<string, number>
): AdvancedRefineReport[] {
  if (!refineTable?.amount || !refineTable?.breath || !Array.isArray(refineTable.data)) {
    return [];
  }

  const result: AdvancedRefineReport[] = [];
  const basePrice = getBasePrice(refineTable, priceTable);
  const sortedBreath = getSortedBreathByPrice(refineTable, priceTable);
  const book = getBookWithPrice(refineTable, priceTable);
  const maxBreathCount = Object.keys(refineTable.breath).length as 3 | 1;

  for (let normalBreath = 0; normalBreath <= maxBreathCount; normalBreath++) {
    for (let bonusBreath = 0; bonusBreath <= maxBreathCount; bonusBreath++) {
      for (
        let enhancedBonusBreath = 0;
        enhancedBonusBreath <=
        (refineTable.hasEnhancedBonus ? maxBreathCount : 0);
        enhancedBonusBreath++
      ) {
        for (
          let normalBook = 0 as 0 | 1;
          normalBook <= (book ? 1 : 0);
          normalBook++
        ) {
          for (
            let bonusBook = 0 as 0 | 1;
            bonusBook <= (book ? 1 : 0);
            bonusBook++
          ) {
            for (
              let enhancedBonusBook = 0 as 0 | 1;
              enhancedBonusBook <= (refineTable.hasEnhancedBonus && book ? 1 : 0);
              enhancedBonusBook++
            ) {
              const normalK = normalBreath + normalBook * (maxBreathCount === 1 ? 2 : 4);
              const bonusK = bonusBreath + bonusBook * (maxBreathCount === 1 ? 2 : 4);
              const enhancedBonusK = enhancedBonusBreath + enhancedBonusBook * (maxBreathCount === 1 ? 2 : 4);

              const paidNormalPrice =
                basePrice +
                getAdditionalPrice(
                  refineTable,
                  priceTable,
                  normalBreath,
                  normalBook
                );
              const freeNormalPrice = getAdditionalPrice(
                refineTable,
                priceTable,
                normalBreath,
                normalBook
              );
              const bonusPrice =
                basePrice +
                getAdditionalPrice(
                  refineTable,
                  priceTable,
                  bonusBreath,
                  bonusBook
                );
              const enhancedBonusPrice =
                basePrice +
                getAdditionalPrice(
                  refineTable,
                  priceTable,
                  enhancedBonusBreath,
                  enhancedBonusBook
                );

              const data = refineTable.data.find(
                (x) =>
                  x.parameters.normalK === normalK &&
                  x.parameters.bonusK === bonusK &&
                  x.parameters.enhancedBonusK === enhancedBonusK
              )?.result;

              if (!data) {
                throw new Error(
                  `Data not found: ${normalK}, ${bonusK}, ${enhancedBonusK}`
                );
              }

              const expectedTryCount =
                data.paidNormalTry +
                data.freeNormalTry +
                data.bonusTry +
                data.enhancedBonusTry;

              const expectedMaterials = [
                ...Object.entries(refineTable.amount).map(([name, amount]) => ({
                  name,
                  amount: amount * expectedTryCount,
                })),
                ...sortedBreath.map((x, index) => {
                  const breathAmount = x?.amount ?? 0;
                  const normalAmount = index < normalBreath ? breathAmount : 0;
                  const bonusAmount = index < bonusBreath ? breathAmount : 0;
                  const enhancedBonusAmount =
                    index < enhancedBonusBreath ? breathAmount : 0;

                  return {
                    name: x?.name ?? "",
                    amount:
                      normalAmount * (data.freeNormalTry + data.paidNormalTry) +
                      bonusAmount * data.bonusTry +
                      enhancedBonusAmount * data.enhancedBonusTry,
                  };
                }),
                ...(book
                  ? [
                      {
                        name: book.name,
                        amount:
                          normalBook * (data.freeNormalTry + data.paidNormalTry) +
                          bonusBook * data.bonusTry +
                          enhancedBonusBook * data.enhancedBonusTry,
                      },
                    ]
                  : []),
              ].filter((material) => material.name && Number.isFinite(material.amount));

              const expectedPrice =
                paidNormalPrice * data.paidNormalTry +
                freeNormalPrice * data.freeNormalTry +
                bonusPrice * data.bonusTry +
                enhancedBonusPrice * data.enhancedBonusTry;

              result.push({
                hasEnhancedBonus: refineTable.hasEnhancedBonus,

                normalBreathNames: [
                  ...sortedBreath.slice(0, normalBreath).map((x) => x?.name).filter(Boolean),
                  ...(normalBook ? [book!.name] : []),
                ],
                bonusBreathNames: [
                  ...sortedBreath.slice(0, bonusBreath).map((x) => x?.name).filter(Boolean),
                  ...(bonusBook ? [book!.name] : []),
                ],
                enhancedBonusBreathNames: [
                  ...sortedBreath.slice(0, enhancedBonusBreath).map((x) => x?.name).filter(Boolean),
                  ...(enhancedBonusBook ? [book!.name] : [])
                ],

                ...data,

                paidNormalPrice,
                freeNormalPrice,
                bonusPrice,
                enhancedBonusPrice,

                expectedTryCount,
                expectedPrice,
                expectedMaterials,
              });
            }
          }
        }
      }
    }
  }

  return result.sort((a, b) => a.expectedPrice - b.expectedPrice);
}
