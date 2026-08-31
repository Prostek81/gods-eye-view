import { withTransaction } from '../db.js';
import type { NormalizedObservation, SourceContext } from '../domain/types.js';
import { insertObservation } from '../repositories/observations.js';
import { upsertEventFromObservation } from '../repositories/events.js';
import { resolveSourceContext } from './sourcePolicy.js';

async function ingestWithContext(obs: NormalizedObservation, source: SourceContext): Promise<{ observationId: string; eventId: string; inserted: boolean }> {
  return withTransaction(async (client) => {
    const observation = await insertObservation(client, obs, source);
    const eventId = await upsertEventFromObservation(client, observation.id, obs, source);
    return { observationId: observation.id, eventId, inserted: observation.inserted };
  });
}

export async function ingestObservation(obs: NormalizedObservation): Promise<{ observationId: string; eventId: string; inserted: boolean }> {
  const source = await resolveSourceContext(obs.sourceId);
  return ingestWithContext(obs, source);
}

export async function ingestMany(items: NormalizedObservation[]) {
  let inserted = 0;
  let seen = 0;
  const contexts = new Map<string, SourceContext>();
  for (const item of items) {
    seen += 1;
    let source = contexts.get(item.sourceId);
    if (!source) {
      source = await resolveSourceContext(item.sourceId);
      contexts.set(item.sourceId, source);
    }
    const result = await ingestWithContext(item, source);
    if (result.inserted) inserted += 1;
  }
  return { seen, inserted };
}
