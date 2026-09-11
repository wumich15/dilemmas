// Count how many players selected each option.
export function tallyChoices(choices) {
  const counts = new Map();
  for (const choice of choices) {
    if (!choice || !Number.isInteger(choice.optionIndex)) continue;
    counts.set(choice.optionIndex, (counts.get(choice.optionIndex) || 0) + 1);
  }
  return counts;
}

// A player gets one point for choosing the unique most common option. If the
// most common choice is tied, everyone gets one point.
export function pointsForChoice(optionIndex, choices) {
  if (!Number.isInteger(optionIndex)) return 0;
  const counts = tallyChoices(choices);
  if (counts.size === 0) return 0;
  const highest = Math.max(...counts.values());
  const winners = [...counts.values()].filter((count) => count === highest).length;
  return winners > 1 || counts.get(optionIndex) === highest ? 1 : 0;
}
