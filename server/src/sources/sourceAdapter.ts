import type { NormalizedObservation } from '../domain/types.js';

export interface SourceAdapter {
  readonly id: string;
  fetch(): Promise<NormalizedObservation[]>;
}
