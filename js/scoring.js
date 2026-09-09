// Points per round, by player count.
export function pointsTable(playerCount) {
  return playerCount >= 5 ? [3, 2, 1] : [2, 1, 0];
}

// votes: array of { responseId }. Returns Map responseId -> vote count.
export function tallyVotes(votes) {
  const counts = new Map();
  for (const vote of votes) {
    if (!vote || !vote.responseId) continue;
    counts.set(vote.responseId, (counts.get(vote.responseId) || 0) + 1);
  }
  return counts;
}

// Standard competition ranking: tied answers share a placement and the
// placements they consume are skipped. Answers with zero votes score nothing.
export function scoreRound(votes, playerCount) {
  const counts = tallyVotes(votes);
  const table = pointsTable(playerCount);
  const result = new Map();
  for (const [responseId, count] of counts) {
    if (count <= 0) continue;
    let better = 0;
    for (const other of counts.values()) if (other > count) better += 1;
    const place = better + 1;
    result.set(responseId, table[place - 1] ?? 0);
  }
  return result;
}

export function pointsFor(responseId, votes, playerCount) {
  if (!responseId) return 0;
  return scoreRound(votes, playerCount).get(responseId) ?? 0;
}
