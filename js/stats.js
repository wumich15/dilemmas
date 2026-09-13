// Anonymous, global response totals. A single aggregate document per dilemma
// keeps reads small and lets every mode share the same percentages.
import {
  db, isConfigured, doc, onSnapshot, runTransaction,
} from "./firebase.js";

const MAX_OPTIONS = 6;

export const globalStatsRef = (dilemmaId) => doc(db, "globalStats", dilemmaId);

function emptyStats(optionCount = MAX_OPTIONS) {
  return { total: 0, optionCount, counts: new Map() };
}

function parseStats(data, fallbackOptionCount = MAX_OPTIONS) {
  if (!data) return emptyStats(fallbackOptionCount);
  const counts = new Map();
  for (let index = 0; index < MAX_OPTIONS; index += 1) {
    const count = Number(data[`option${index}`]);
    if (Number.isFinite(count) && count > 0) counts.set(index, count);
  }
  return {
    total: Math.max(0, Number(data.total) || 0),
    optionCount: Number.isInteger(data.optionCount) ? data.optionCount : fallbackOptionCount,
    counts,
  };
}

function dataForStats(total, optionCount, counts) {
  const data = { total, optionCount };
  for (let index = 0; index < MAX_OPTIONS; index += 1) {
    data[`option${index}`] = counts.get(index) || 0;
  }
  return data;
}

// The transaction is safe when several people answer at the same time. The
// rules only permit one total and one option count to increase per write.
export async function recordGlobalResponse(dilemmaId, optionIndex, optionCount) {
  if (!isConfigured || !dilemmaId) return null;
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= optionCount) {
    throw new Error("That choice is not available.");
  }

  const ref = globalStatsRef(dilemmaId);
  const next = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const current = parseStats(snap.exists() ? snap.data() : null, optionCount);
    const counts = new Map(current.counts);
    counts.set(optionIndex, (counts.get(optionIndex) || 0) + 1);
    const data = dataForStats(current.total + 1, current.optionCount || optionCount, counts);
    if (snap.exists()) transaction.update(ref, data);
    else transaction.set(ref, data);
    return data;
  });
  return parseStats(next, optionCount);
}

export function watchGlobalStats(dilemmaId, optionCount, onChange, onError) {
  if (!isConfigured || !dilemmaId) return () => {};
  return onSnapshot(
    globalStatsRef(dilemmaId),
    (snap) => onChange(parseStats(snap.exists() ? snap.data() : null, optionCount)),
    onError,
  );
}
