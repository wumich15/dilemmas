// Pure dilemma-selection helpers. `history` is a Map of dilemma id -> time seen
// (milliseconds); ids missing from it have never been seen.

export function shuffle(items, random = Math.random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function unseen(catalogIds, history) {
  return catalogIds.filter((id) => !history.has(id));
}

// Unseen dilemmas first. If there are not enough, fall back to the ones seen
// least recently so repeat avoidance never blocks a game.
export function pickSingleplayerQueue(catalogIds, history, size, random = Math.random) {
  const fresh = shuffle(unseen(catalogIds, history), random);
  if (fresh.length >= size) return fresh.slice(0, size);
  const stale = catalogIds
    .filter((id) => history.has(id))
    .sort((a, b) => history.get(a) - history.get(b));
  return fresh.concat(stale).slice(0, size);
}

export function pickCandidates(catalogIds, size, random = Math.random) {
  return shuffle(catalogIds, random).slice(0, Math.min(size, catalogIds.length));
}

// counts: Map candidate id -> how many players in the room have seen it.
// Fewest-seen first, ties broken randomly. The list is cycled if the catalog
// cannot cover the requested round count.
export function chooseDilemmaIds(candidates, counts, needed, random = Math.random) {
  const ranked = shuffle(candidates, random)
    .sort((a, b) => (counts.get(a) || 0) - (counts.get(b) || 0));
  const chosen = ranked.slice(0, needed);
  if (chosen.length === 0) return [];
  for (let i = 0; chosen.length < needed; i += 1) chosen.push(chosen[i % ranked.length]);
  return chosen;
}
