// Import this gate from GEV layer-toggle/data-loader entry points during migration.
// It intentionally defaults uncertain commercial sources to OFF.
const DEFAULT_POLICY = Object.freeze({
  usgs: 'allow',
  nasa_eonet: 'allow',
  gdelt: 'allow',
  open_meteo: 'allow',
  celestrak: 'allow',
  launch_library_2: 'allow',
  google_maps: 'conditional',
  tomtom: 'conditional',
  osm: 'conditional',
  adsb_lol: 'conditional',
  opensky: 'blocked',
  google_news_rss: 'blocked',
  aisstream: 'blocked',
  telegeography_submarine_cables: 'blocked',
});

export function sourceAllowed(sourceId, enabledConditionals = new Set()) {
  const policy = DEFAULT_POLICY[sourceId] ?? 'blocked';
  if (policy === 'allow') return true;
  if (policy === 'conditional') return enabledConditionals.has(sourceId);
  return false;
}

export function assertSourceAllowed(sourceId, enabledConditionals) {
  if (!sourceAllowed(sourceId, enabledConditionals)) {
    throw new Error(`Source disabled by commercial profile: ${sourceId}`);
  }
}
