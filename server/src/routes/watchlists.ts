import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { config } from '../config.js';
import { assertInternal } from '../security.js';
import { httpError, requireUuid } from '../validation.js';

export async function watchlistRoutes(app: FastifyInstance) {
  app.post('/api/v1/watchlists', async (request, reply) => {
    assertInternal(request);
    const body = request.body as { name?: unknown; description?: unknown };
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200) throw httpError(400, 'name is required and must be <= 200 chars');
    if (body.description != null && (typeof body.description !== 'string' || body.description.length > 2000)) throw httpError(400, 'description is invalid');
    const result = await db.query(`
      INSERT INTO watchlists (name, description)
      VALUES ($1,$2)
      RETURNING *
    `, [body.name.trim(), body.description ?? null]);
    return reply.code(201).send(result.rows[0]);
  });

  app.get('/api/v1/watchlists', async () => {
    const result = await db.query(`
      SELECT w.*, count(wa.asset_id)::int AS asset_count
      FROM watchlists w
      LEFT JOIN watchlist_assets wa ON wa.watchlist_id = w.id
      GROUP BY w.id
      ORDER BY w.created_at DESC
    `);
    return { items: result.rows, count: result.rowCount ?? 0 };
  });

  app.post('/api/v1/watchlists/:id/assets', async (request, reply) => {
    assertInternal(request);
    const id = requireUuid((request.params as { id?: unknown }).id, 'watchlist id');
    const body = request.body as { assetId?: unknown };
    const assetId = requireUuid(body.assetId, 'assetId');
    await db.query(`
      INSERT INTO watchlist_assets (watchlist_id, asset_id)
      VALUES ($1,$2)
      ON CONFLICT DO NOTHING
    `, [id, assetId]);
    return reply.code(204).send();
  });

  app.get('/api/v1/watchlists/:id/risk', async (request) => {
    const id = requireUuid((request.params as { id?: unknown }).id, 'watchlist id');
    const result = await db.query(`
      SELECT a.id AS asset_id, a.name AS asset_name, a.asset_type,
             r.score, r.distance_km, r.calculated_at,
             e.id AS event_id, e.event_type, e.title, e.severity, e.confidence,
             ST_AsGeoJSON(e.geom)::json AS event_geometry
      FROM watchlist_assets wa
      JOIN assets a ON a.id = wa.asset_id
      LEFT JOIN risk_scores r ON r.asset_id = a.id
      LEFT JOIN events e ON e.id = r.event_id
      WHERE wa.watchlist_id = $1
        AND (e.id IS NULL OR e.ingest_profile = $2)
      ORDER BY r.score DESC NULLS LAST, a.name
      LIMIT 1000
    `, [id, config.dataProfile]);
    const scores = result.rows.map(r => Number(r.score ?? 0));
    return { watchlistId: id, maxRisk: scores.length ? Math.max(...scores) : 0, items: result.rows };
  });
}
