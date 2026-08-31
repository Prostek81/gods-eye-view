import { db } from '../db.js';
import { config } from '../config.js';
import type { SourceContext } from '../domain/types.js';

export type SourceStoragePolicy = 'normalized_only' | 'transient_only' | 'none';

type SourceRow = {
  id: string;
  policy: 'allowed' | 'conditional' | 'dev_only' | 'blocked';
  license_class: string;
  attribution: string;
  storage_policy: SourceStoragePolicy;
};

const cache = new Map<string, SourceRow>();

async function sourceRow(sourceId: string): Promise<SourceRow> {
  const cached = cache.get(sourceId);
  if (cached) return cached;
  const result = await db.query<SourceRow>(`
    SELECT id, policy, license_class, attribution, storage_policy
    FROM sources WHERE id = $1
  `, [sourceId]);
  const row = result.rows[0];
  if (!row) throw new Error(`Source is not registered: ${sourceId}`);
  cache.set(sourceId, row);
  return row;
}

function assertPolicy(row: SourceRow): void {
  if (row.policy === 'blocked') throw new Error(`Source is blocked by policy: ${row.id}`);
  if (row.policy === 'dev_only' && config.dataProfile !== 'development') {
    throw new Error(`DEV ONLY source cannot enter commercial profile: ${row.id}`);
  }
  if (row.policy === 'conditional' && !config.conditionalSources.has(row.id)) {
    throw new Error(`Conditional source is not enabled: ${row.id}`);
  }
}

export async function assertPersistentFetchAllowed(sourceId: string): Promise<void> {
  const source = await sourceRow(sourceId);
  assertPolicy(source);
  if (source.storage_policy !== 'normalized_only') {
    throw new Error(`Persistent worker cannot fetch source with storage policy ${source.storage_policy}: ${sourceId}`);
  }
}

export async function resolveSourceContext(sourceId: string): Promise<SourceContext> {
  const source = await sourceRow(sourceId);
  assertPolicy(source);
  if (source.storage_policy !== 'normalized_only') {
    throw new Error(`Source storage policy forbids Event Store persistence: ${sourceId}`);
  }
  return {
    sourceId: source.id,
    licenseClass: source.license_class,
    attribution: source.attribution,
    ingestProfile: config.dataProfile,
  };
}
