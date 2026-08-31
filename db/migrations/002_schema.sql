DO $$ BEGIN
  CREATE TYPE source_policy AS ENUM ('allowed','conditional','dev_only','blocked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE event_status AS ENUM ('open','closed','unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE alert_status AS ENUM ('new','acknowledged','closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS sources (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  policy source_policy NOT NULL,
  license_name text NOT NULL,
  license_class text NOT NULL,
  terms_url text,
  attribution text NOT NULL,
  storage_policy text NOT NULL DEFAULT 'normalized_only',
  commercial_note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES sources(id),
  source_object_id text NOT NULL,
  entity_type text NOT NULL,
  geom geometry(Geometry, 4326) NOT NULL,
  altitude_m double precision,
  observed_at timestamptz NOT NULL,
  source_revision_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NOT NULL DEFAULT now(),
  freshness_ms bigint,
  severity double precision NOT NULL DEFAULT 0 CHECK (severity >= 0 AND severity <= 100),
  event_status event_status NOT NULL DEFAULT 'unknown',
  title text,
  confidence double precision NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  source_quality double precision CHECK (source_quality IS NULL OR (source_quality >= 0 AND source_quality <= 1)),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_payload_hash text NOT NULL,
  license_class text NOT NULL,
  attribution text NOT NULL,
  ingest_profile text NOT NULL CHECK (ingest_profile IN ('commercial_clean','development')),
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dedupe_key)
);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES sources(id),
  ingest_profile text NOT NULL CHECK (ingest_profile IN ('commercial_clean','development')),
  event_key text NOT NULL,
  event_type text NOT NULL,
  status event_status NOT NULL DEFAULT 'unknown',
  title text,
  geom geometry(Geometry, 4326) NOT NULL,
  first_seen timestamptz NOT NULL,
  last_seen timestamptz NOT NULL,
  current_observed_at timestamptz NOT NULL,
  current_source_revision_at timestamptz,
  closed_at timestamptz,
  severity double precision NOT NULL DEFAULT 0 CHECK (severity >= 0 AND severity <= 100),
  peak_severity double precision NOT NULL DEFAULT 0 CHECK (peak_severity >= 0 AND peak_severity <= 100),
  confidence double precision NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  anomaly_score double precision CHECK (anomaly_score IS NULL OR (anomaly_score >= 0 AND anomaly_score <= 100)),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ingest_profile, event_key)
);

CREATE TABLE IF NOT EXISTS event_observations (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  observation_id uuid NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, observation_id)
);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_key text UNIQUE,
  name text NOT NULL,
  asset_type text NOT NULL,
  geom geometry(Geometry, 4326) NOT NULL,
  importance double precision NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watchlist_assets (
  watchlist_id uuid NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (watchlist_id, asset_id)
);

CREATE TABLE IF NOT EXISTS anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingest_profile text NOT NULL CHECK (ingest_profile IN ('commercial_clean','development')),
  scope_type text NOT NULL,
  scope_key text NOT NULL,
  metric text NOT NULL,
  current_value double precision NOT NULL,
  baseline_mean double precision NOT NULL,
  baseline_stddev double precision NOT NULL,
  percentile double precision NOT NULL CHECK (percentile >= 0 AND percentile <= 1),
  z_score double precision NOT NULL,
  score double precision NOT NULL CHECK (score >= 0 AND score <= 100),
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  score double precision NOT NULL CHECK (score >= 0 AND score <= 100),
  severity_component double precision NOT NULL,
  confidence_component double precision NOT NULL,
  proximity_component double precision NOT NULL,
  importance_component double precision NOT NULL,
  distance_km double precision NOT NULL,
  explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, event_id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES assets(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  anomaly_id uuid REFERENCES anomalies(id) ON DELETE SET NULL,
  alert_type text NOT NULL,
  severity double precision NOT NULL CHECK (severity >= 0 AND severity <= 100),
  status alert_status NOT NULL DEFAULT 'new',
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES sources(id),
  ingest_profile text NOT NULL CHECK (ingest_profile IN ('commercial_clean','development')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  observations_seen integer NOT NULL DEFAULT 0,
  observations_inserted integer NOT NULL DEFAULT 0,
  error text
);
