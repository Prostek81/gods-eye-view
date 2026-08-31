import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { queryEvents } from '../repositories/events.js';
import { config } from '../config.js';
import { finiteNumber, requireBbox, requireIsoTimestamp, requireUuid } from '../validation.js';

export async function eventsRoutes(app: FastifyInstance) {
  app.get('/api/v1/events', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const client = await db.connect();
    try {
      const result = await queryEvents(client, {
        at: q.at ? requireIsoTimestamp(q.at, 'at') : undefined,
        from: q.from ? requireIsoTimestamp(q.from, 'from') : undefined,
        to: q.to ? requireIsoTimestamp(q.to, 'to') : undefined,
        bbox: q.bbox ? requireBbox(q.bbox) : undefined,
        eventTypes: q.types?.split(',').map(v => v.trim()).filter(Boolean).slice(0, 50),
        minSeverity: q.minSeverity == null ? undefined : finiteNumber(q.minSeverity, 'minSeverity', 0, 100),
        limit: q.limit == null ? 200 : Math.trunc(finiteNumber(q.limit, 'limit', 1, 1000)),
      }, config.dataProfile);
      return { items: result.rows, count: result.rowCount ?? 0 };
    } finally {
      client.release();
    }
  });

  app.get('/api/v1/events/:id', async (request, reply) => {
    const id = requireUuid((request.params as { id?: unknown }).id, 'id');
    const result = await db.query(`
      SELECT e.*, ST_AsGeoJSON(e.geom)::json AS geometry,
             COALESCE(json_agg(json_build_object(
               'id', o.id,
               'sourceId', o.source_id,
               'sourceObjectId', o.source_object_id,
               'observedAt', o.observed_at,
               'sourceRevisionAt', o.source_revision_at,
               'receivedAt', o.received_at,
               'severity', o.severity,
               'status', o.event_status,
               'title', o.title,
               'confidence', o.confidence,
               'licenseClass', o.license_class,
               'attribution', o.attribution,
               'properties', o.properties
             ) ORDER BY o.observed_at DESC, o.source_revision_at DESC NULLS LAST) FILTER (WHERE o.id IS NOT NULL), '[]') AS observations
      FROM events e
      LEFT JOIN event_observations eo ON eo.event_id = e.id
      LEFT JOIN observations o ON o.id = eo.observation_id AND o.ingest_profile = $2
      WHERE e.id = $1 AND e.ingest_profile = $2
      GROUP BY e.id
    `, [id, config.dataProfile]);
    if (!result.rows[0]) return reply.code(404).send({ error: 'not_found' });
    return result.rows[0];
  });
}
