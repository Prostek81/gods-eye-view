export type AnomalyDirection = 'two_sided' | 'high' | 'low';

export interface AnomalyEvaluation {
  mean: number;
  stddev: number;
  zScore: number;
  percentile: number;
  score: number;
  confidence: number;
  sampleSize: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function mean(values: number[]): number {
  if (!values.length) throw new Error('baseline must not be empty');
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function sampleStdDev(values: number[], avg = mean(values)): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((acc, value) => acc + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function percentileRank(values: number[], current: number): number {
  if (!values.length) throw new Error('baseline must not be empty');
  let below = 0;
  let equal = 0;
  for (const value of values) {
    if (value < current) below += 1;
    else if (value === current) equal += 1;
  }
  return clamp((below + 0.5 * equal) / values.length, 0, 1);
}

export function evaluateAnomaly(
  current: number,
  baseline: number[],
  direction: AnomalyDirection = 'two_sided',
): AnomalyEvaluation {
  if (baseline.length < 3) throw new Error('baseline requires at least 3 samples');
  const avg = mean(baseline);
  const rawStd = sampleStdDev(baseline, avg);

  // Prevent nearly-constant baselines from producing unbounded z-scores.
  const floor = Math.max(Math.abs(avg) * 0.01, 1e-9);
  const stddev = Math.max(rawStd, floor);
  const zScore = (current - avg) / stddev;
  const percentile = percentileRank(baseline, current);

  let directionalZ: number;
  let tail: number;
  if (direction === 'high') {
    directionalZ = Math.max(0, zScore);
    tail = percentile;
  } else if (direction === 'low') {
    directionalZ = Math.max(0, -zScore);
    tail = 1 - percentile;
  } else {
    directionalZ = Math.abs(zScore);
    tail = Math.abs(percentile - 0.5) * 2;
  }

  // z >= 4 is saturated. Tail percentile adds robustness when variance is odd.
  const zComponent = clamp((directionalZ / 4) * 100, 0, 100);
  const tailComponent = clamp(tail * 100, 0, 100);
  const score = clamp(0.7 * zComponent + 0.3 * tailComponent, 0, 100);

  // Confidence measures baseline evidence, not the truth of the source event.
  const sampleConfidence = clamp(baseline.length / 50, 0, 1);
  const confidence = clamp(0.35 + 0.65 * sampleConfidence, 0, 1);

  return { mean: avg, stddev, zScore, percentile, score, confidence, sampleSize: baseline.length };
}
