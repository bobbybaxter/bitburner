// TODO: fix types with Augs

export const DOMAINS = {
  hacking: estimateHackingValue,
  charisma: estimateCharismaValue,
  combat: estimateCombatValue,
  crime: estimateCrimeValue,
  faction: estimateFactionValue,
  hacknet: estimateHacknetValue,
  bladeburner: estimateBladeburnerValue,
  all: estimateAllValue,
};

export function estimateHackingValue(aug) {
  const stats = aug.stats;
  let value =
    (stats.hacking_mult || 1) *
    Math.sqrt(stats.hacking_exp_mult || 1) *
    Math.sqrt(stats.hacking_chance_mult || 1) *
    ((stats.hacking_money_mult || 1) + (stats.hacking_grow_mult || 1) - 1) *
    (stats.hacking_speed_mult || 1);
  if (aug.name === 'BitRunners Neurolink') {
    value += 0.05;
  }
  if (aug.name === 'CashRoot Starter Kit') {
    value += 0.05;
  }
  if (aug.name === 'PCMatrix') {
    value += 0.05;
  }
  if (aug.name === 'The Red Pill') {
    value += 9;
  }
  return value;
}

export function estimateCombatValue(aug) {
  const stats = aug.stats;
  return (
    Math.sqrt(stats.agility_exp_mult || 1) * (stats.agility_mult || 1) -
    1 +
    Math.sqrt(stats.defense_exp_mult || 1) * (stats.defense_mult || 1) -
    1 +
    Math.sqrt(stats.strength_exp_mult || 1) * (stats.strength_mult || 1) -
    1 +
    Math.sqrt(stats.dexterity_exp_mult || 1) * (stats.dexterity_mult || 1) -
    1 +
    1
  );
}

export function estimateCharismaValue(aug) {
  const stats = aug.stats;
  return Math.sqrt(stats.charisma_exp_mult || 1) * (stats.charisma_mult || 1);
}

export function estimateCrimeValue(aug) {
  const stats = aug.stats;
  return (stats.crime_money_mult || 1) * (stats.crime_success_mult || 1) - 1 + 1;
}

export function estimateFactionValue(aug) {
  const stats = aug.stats;
  let value =
    (stats.company_rep_mult || 1) -
    1 +
    Math.sqrt(stats.work_money_mult || 1) -
    1 +
    (stats.faction_rep_mult || 1) -
    1 +
    1;
  if (aug.name === 'Neuroreceptor Management Implant') {
    // Always get "focus" bonus
    value *= 1 / 0.8;
  }
  return value;
}

export function estimateHacknetValue(aug) {
  const stats = aug.stats;
  return (
    1 / (stats.hacknet_node_purchase_cost_mult || 1) -
    1 +
    (stats.hacknet_node_money_mult || 1) *
      (1 / (stats.hacknet_node_level_cost_mult || 1)) *
      (1 / (stats.hacknet_node_core_cost_mult || 1)) *
      (1 / (stats.hacknet_node_ram_cost_mult || 1)) -
    1 +
    1
  );
}

export function estimateBladeburnerValue(aug) {
  const stats = aug.stats;
  let value =
    Math.sqrt(stats.agility_exp_mult || 1) * (stats.agility_mult || 1) -
    1 +
    Math.sqrt(stats.dexterity_exp_mult || 1) * (stats.dexterity_mult || 1) -
    1 +
    (stats.bladeburner_success_chance_mult || 1) * (stats.bladeburner_stamina_gain_mult || 1) -
    1 +
    (stats.bladeburner_max_stamina_mult || 1) -
    1 +
    (stats.bladeburner_analysis_mult || 1) -
    1 +
    1;
  if (aug.name === "The Blade's Simulacrum") {
    value += 0.7;
  }
  return value;
}

export function estimateAllValue(aug) {
  // assume this runs after other values have been populated.
  delete aug.value.all;
  return averageValue(aug);
}

export function averageValue(aug, domains) {
  if (!domains || domains.length == 0) {
    domains = Object.keys(aug.value);
  }
  if (domains.length == 0) {
    return 1.0;
  }
  let total = 1.0;
  for (const domain of domains) {
    total *= aug.value[domain];
  }
  const value = total ** (1 / domains.length);
  return value;
}
