import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { assertInternal } from '../security.js';
import { finiteNumber, httpError, requireGeometry, requireUuid } from '../validation.js';
import { config } from '../config.js';

export async function assetsRoutes(app: FastifyInstance) {
  app.post('/api/v1/assets', async (request, reply) => {
    assertInternal(request);
    const body = request.body as { externalKey?: unknown; name?: unknown; assetType?: unknown; geometry?: unknown; importance?: unknown; properties?: unknown };
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200) throw httpError(400, 'name is required and must be <= 200 chars');
    if (typeof body.assetType !== 'string' || !/^[a-z0-9_.-]{1,64}$/i.test(body.assetType)) throw httpError(400, 'assetType is invalid');
    const geometry = requireGeometry(body.geometry);
    const importance = body.importance == null ? 0.5 : finiteNumber(body.importance, 'importance', 0, 1);
    const externalKey = body.externalKey == null ? null : String(body.externalKey).slice(0, 256);
    const properties = body.properties == null ? {} : body.properties;
    if (typeof properties !== 'object' || Array.isArray(properties)) throw httpError(400, 'properties must be an object');
    const result = await db.query(`
      INSERT INTO assets (external_key, name, asset_type, geom, importance, properties)
      VALUES ($1,$2,$3,ST_SetSRID(ST_GeomFromGeoJSON($4),4326),$5,$6::jsonb)
      RETURNING id, external_key, name, asset_type, ST_AsGeoJSON(geom)::json AS geometry, importance, properties
    `, [externalKey, body.name.trim(), body.assetType, JSON.stringify(geometry), importance, JSON.stringify(properties)]);
    return reply.code(201).send(result.rows[0]);
  });

  app.get('/api/v1/assets', async () => {
    const result = await db.query(`
      SELECT id, external_key, name, asset_type, ST_AsGeoJSON(geom)::json AS geometry, importance, properties, created_at, updated_at
      FROM assets ORDER BY name
    `);
    return { items: result.rows, count: result.rowCount ?? 0 };
  });

  app.get('/api/v1/assets/:id/risk', async (request) => {
    const id = requireUuid((request.params as { id?: unknown }).id, 'id');
    const result = await db.query(`
      SELECT r.*, e.event_type, e.title, e.status, e.severity AS event_severity,
             ST_AsGeoJSON(e.geom)::json AS event_geometry
      FROM risk_scores r
      JOIN events e ON e.id = r.event_id
      WHERE r.asset_id = $1 AND e.ingest_profile = $2
      ORDER BY r.score DESC, r.calculated_at DESC
      LIMIT 200
    `, [id, config.dataProfile]);
    return { assetId: id, items: result.rows };
  });
}
