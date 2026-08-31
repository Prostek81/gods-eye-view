CREATE INDEX IF NOT EXISTS observations_geom_gix ON observations USING gist (geom);
CREATE INDEX IF NOT EXISTS observations_observed_at_idx ON observations (observed_at DESC);
CREATE INDEX IF NOT EXISTS observations_identity_time_idx ON observations (source_id, source_object_id, observed_at DESC, source_revision_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS observations_profile_time_idx ON observations (ingest_profile, observed_at DESC);
CREATE INDEX IF NOT EXISTS observations_source_time_idx ON observations (source_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS observations_entity_time_idx ON observations (entity_type, observed_at DESC);
CREATE INDEX IF NOT EXISTS observations_properties_gin ON observations USING gin (properties);

CREATE INDEX IF NOT EXISTS events_geom_gix ON events USING gist (geom);
CREATE INDEX IF NOT EXISTS events_profile_time_idx ON events (ingest_profile, last_seen DESC);
CREATE INDEX IF NOT EXISTS events_time_idx ON events (first_seen DESC, last_seen DESC);
CREATE INDEX IF NOT EXISTS events_type_time_idx ON events (event_type, last_seen DESC);
CREATE INDEX IF NOT EXISTS events_severity_idx ON events (severity DESC);
CREATE INDEX IF NOT EXISTS events_properties_gin ON events USING gin (properties);

CREATE INDEX IF NOT EXISTS assets_geom_gix ON assets USING gist (geom);
CREATE INDEX IF NOT EXISTS assets_type_idx ON assets (asset_type);

CREATE INDEX IF NOT EXISTS anomalies_profile_time_idx ON anomalies (ingest_profile, detected_at DESC);
CREATE INDEX IF NOT EXISTS anomalies_scope_metric_time_idx ON anomalies (scope_type, scope_key, metric, detected_at DESC);
CREATE INDEX IF NOT EXISTS anomalies_score_idx ON anomalies (score DESC, detected_at DESC);
CREATE INDEX IF NOT EXISTS risk_scores_asset_score_idx ON risk_scores (asset_id, score DESC, calculated_at DESC);
CREATE INDEX IF NOT EXISTS risk_scores_event_idx ON risk_scores (event_id, score DESC);
CREATE INDEX IF NOT EXISTS alerts_status_severity_idx ON alerts (status, severity DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS watchlist_assets_asset_idx ON watchlist_assets (asset_id);
