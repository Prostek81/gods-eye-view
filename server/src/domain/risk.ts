export interface RiskInput {
  severity: number;          // 0..100
  eventConfidence: number;   // 0..1
  distanceKm: number;
  impactRadiusKm: number;
  assetImportance: number;   // 0..1
}

export interface RiskEvaluation {
  score: number;
  severityComponent: number;
  confidenceComponent: number;
  proximityComponent: number;
  importanceComponent: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function proximityDecay(distanceKm: number, impactRadiusKm: number): number {
  const radius = Math.max(1, impactRadiusKm);
  const d = Math.max(0, distanceKm);
  // 1.0 at the event; 0.5 at the impact radius; smooth long tail beyond it.
  return 1 / (1 + (d / radius) ** 2);
}

export function calculateRisk(input: RiskInput): RiskEvaluation {
  const severityComponent = clamp01(input.severity / 100);
  const confidenceComponent = clamp01(input.eventConfidence);
  const proximityComponent = clamp01(proximityDecay(input.distanceKm, input.impactRadiusKm));
  const importanceComponent = clamp01(input.assetImportance);

  // Conservative multiplicative model: weak evidence or poor proximity suppresses risk.
  const score = 100 * severityComponent * confidenceComponent * proximityComponent * importanceComponent;

  return {
    score: Math.round(Math.max(0, Math.min(100, score)) * 100) / 100,
    severityComponent,
    confidenceComponent,
    proximityComponent,
    importanceComponent,
  };
}
