import assert from "node:assert/strict";

const poolAggregates = Object.freeze([
  ["Wizard", 24, 159], ["Illusionist", 24, 160], ["Runeblade", 24, 164], ["Lightning", 42, 227],
  ["Generic", 6, 28], ["Equipment", 14, 148], ["Rare", 60, 120], ["Majestic", 15, 30],
  ["Rfcommon", 105, 105], ["RFRare", 59, 59], ["RFMajestic", 7, 7]
]);

export const assertPackLocalInitialProjectionMatchesCompiledTables = (tables, initial) => {
  assert.equal(tables.poolTables.length, poolAggregates.length);
  assert.equal(initial.poolStates.length, tables.poolTables.length);
  for (let poolIndex = 0; poolIndex < poolAggregates.length; poolIndex++) {
    const [label, entryCount, total] = poolAggregates[poolIndex];
    const table = tables.poolTables[poolIndex], poolState = initial.poolStates[poolIndex];
    assert.equal(table.poolReference.sourcePoolLabel, label);
    assert.equal(table.officialIdentityChoices.length, entryCount);
    assert.equal(table.poolTotalWeight, total);
    assert.equal(poolState.poolReference, table.poolReference);
    assert.equal(poolState.officialIdentityChoices.length, table.officialIdentityChoices.length);
    assert.equal(poolState.poolTotalWeight, table.poolTotalWeight);
    for (let choiceIndex = 0; choiceIndex < table.officialIdentityChoices.length; choiceIndex++) {
      const sourceChoice = table.officialIdentityChoices[choiceIndex], projectedChoice = poolState.officialIdentityChoices[choiceIndex];
      assert.equal(projectedChoice.officialIdentityReference, sourceChoice.officialIdentityReference);
      assert.equal(projectedChoice.weight, sourceChoice.weight);
      assert.equal(projectedChoice.cumulativeExclusiveEnd, sourceChoice.cumulativeExclusiveEnd);
    }
  }
};
