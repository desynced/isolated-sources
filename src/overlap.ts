export interface Span {
  start: number;
  end: number;
  score: number;
}

/**
 * Collapse overlapping spans into a non-overlapping cover.
 * The reported record is the highest-scoring span that already covers the
 * whole cluster when one does, so a wide "Judge Harper Quinn" hit keeps its
 * own recognizer instead of shrinking to an inner surname.
 * Otherwise the cluster widens to the union and keeps the best score's label,
 * so a partial overlap cannot leave a fragment behind.
 */
export function resolveOverlaps<T extends Span>(items: readonly T[]): T[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort(
    (a, b) => a.start - b.start || b.end - a.end || b.score - a.score,
  );
  const clusters: T[][] = [];
  for (const item of sorted) {
    const last = clusters[clusters.length - 1];
    const clusterEnd = last ? Math.max(...last.map((entry) => entry.end)) : -1;
    if (last && item.start < clusterEnd) last.push(item);
    else clusters.push([item]);
  }

  return clusters.map((cluster) => {
    const start = Math.min(...cluster.map((entry) => entry.start));
    const end = Math.max(...cluster.map((entry) => entry.end));
    const covering = cluster.filter((entry) => entry.start === start && entry.end === end);
    const pool = covering.length > 0 ? covering : cluster;
    const best = pool.reduce((current, candidate) =>
      candidate.score > current.score ? candidate : current,
    );
    if (best.start === start && best.end === end) return best;
    return { ...best, start, end };
  });
}
