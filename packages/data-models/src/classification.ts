import type { ClassificationMethod } from "./manifest";

export interface ClassBreaks {
  method: ClassificationMethod;
  /** N-1 break values that define N classes. */
  breaks: number[];
  min: number;
  max: number;
}

/**
 * Compute class breaks for an array of numeric values.
 *
 * @param values - Raw numeric values (will be sorted internally).
 * @param method - Classification algorithm.
 * @param classes - Number of target classes (2-7).
 * @param manualBreaks - User-provided breaks when method is "manual".
 */
export function classify(
  values: number[],
  method: ClassificationMethod,
  classes: number,
  manualBreaks?: number[],
): ClassBreaks {
  if (values.length === 0) {
    return { method, breaks: [], min: 0, max: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  if (classes <= 1 || min === max) {
    return { method, breaks: [], min, max };
  }

  switch (method) {
    case "equal-interval":
      return { method, breaks: equalInterval(min, max, classes), min, max };
    case "quantile":
      return { method, breaks: quantile(sorted, classes), min, max };
    case "natural-breaks":
      return { method, breaks: naturalBreaks(sorted, classes), min, max };
    case "manual":
      return { method, breaks: manualBreaks ?? [], min, max };
  }
}

// ─── Equal Interval ─────────────────────────────────────────

function equalInterval(min: number, max: number, classes: number): number[] {
  const step = (max - min) / classes;
  const breaks: number[] = [];
  for (let i = 1; i < classes; i++) {
    breaks.push(min + step * i);
  }
  return breaks;
}

// ─── Quantile ───────────────────────────────────────────────

function quantile(sorted: number[], classes: number): number[] {
  const breaks: number[] = [];
  for (let i = 1; i < classes; i++) {
    const idx = Math.floor((i / classes) * sorted.length);
    breaks.push(sorted[Math.min(idx, sorted.length - 1)]);
  }
  return breaks;
}

// ─── Natural Breaks (Fisher-Jenks) ─────────────────────────

const MAX_SAMPLE_SIZE = 1000;

function naturalBreaks(sorted: number[], classes: number): number[] {
  // Sub-sample for performance on large datasets
  let data = sorted;
  if (data.length > MAX_SAMPLE_SIZE) {
    const step = data.length / MAX_SAMPLE_SIZE;
    data = Array.from(
      { length: MAX_SAMPLE_SIZE },
      (_, i) => sorted[Math.min(Math.floor(i * step), sorted.length - 1)],
    );
  }

  const n = data.length;
  const k = Math.min(classes, n);

  if (k <= 1) return [];

  // Allocate matrices
  const lowerClassLimits: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(k + 1).fill(0),
  );
  const varianceCombinations: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(k + 1).fill(Infinity),
  );

  for (let i = 1; i <= k; i++) {
    lowerClassLimits[1][i] = 1;
    varianceCombinations[1][i] = 0;
  }

  for (let l = 2; l <= n; l++) {
    let sumZ = 0;
    let sumZ2 = 0;

    for (let m = 1; m <= l; m++) {
      const lowerClassLimit = l - m + 1;
      const val = data[lowerClassLimit - 1];

      sumZ += val;
      sumZ2 += val * val;

      const variance = sumZ2 - (sumZ * sumZ) / m;

      if (lowerClassLimit > 1) {
        for (let j = 2; j <= k; j++) {
          const prev = varianceCombinations[lowerClassLimit - 1][j - 1];
          if (prev + variance < varianceCombinations[l][j]) {
            lowerClassLimits[l][j] = lowerClassLimit;
            varianceCombinations[l][j] = prev + variance;
          }
        }
      }
    }

    lowerClassLimits[l][1] = 1;
    varianceCombinations[l][1] = sumZ2 - (sumZ * sumZ) / l;
  }

  // Extract break values
  const breaks: number[] = new Array(k - 1);
  let kk = n;

  for (let j = k; j >= 2; j--) {
    const idx = lowerClassLimits[kk][j] - 1;
    breaks[j - 2] = data[idx];
    kk = lowerClassLimits[kk][j] - 1;
  }

  return breaks;
}
