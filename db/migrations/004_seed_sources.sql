INSERT INTO sources (id, display_name, policy, license_name, license_class, terms_url, attribution, storage_policy, commercial_note)
VALUES
  ('usgs', 'USGS Earthquake Hazards Program', 'allowed', 'U.S. public domain', 'public_domain', 'https://earthquake.usgs.gov/fdsnws/event/1/', 'Data courtesy of the U.S. Geological Survey', 'normalized_only', 'Production-enabled by default.'),
  ('nasa_eonet', 'NASA EONET', 'allowed', 'NASA public data / source-specific metadata', 'nasa_public_data', 'https://eonet.gsfc.nasa.gov/docs/v3', 'NASA EONET', 'normalized_only', 'Production-enabled by default; preserve source links/disclaimer context.'),
  ('gdelt', 'GDELT Project', 'allowed', 'GDELT Terms of Use', 'provider_terms', 'https://www.gdeltproject.org/about.html#termsofuse', 'GDELT Project', 'normalized_only', 'Commercial use permitted by upstream project with citation; linked publishers retain their own terms.'),
  ('open_meteo', 'Open-Meteo', 'allowed', 'CC BY 4.0', 'cc_by_4_0', 'https://open-meteo.com/en/licence', 'Weather data by Open-Meteo.com', 'normalized_only', 'Preserve adjacent attribution requirements where applicable.'),
  ('celestrak', 'CelesTrak', 'allowed', 'US-government-origin data / citation requested', 'public_data_with_citation', 'https://celestrak.org/', 'CelesTrak / Dr. T.S. Kelso', 'normalized_only', 'Production-enabled subject to citation.'),
  ('launch_library_2', 'Launch Library 2', 'allowed', 'The Space Devs Terms', 'provider_terms', 'https://thespacedevs.com/', 'Launch Library 2 — The Space Devs', 'normalized_only', 'Use with provider rate limits and added value.'),
  ('opensky', 'OpenSky Network', 'blocked', 'Non-commercial / agreement required', 'noncommercial_or_contract_required', 'https://opensky-network.org/', 'OpenSky Network', 'none', 'Blocked in default commercial profile pending written commercial terms.'),
  ('google_news_rss', 'Google News RSS', 'blocked', 'Personal/noncommercial', 'noncommercial', 'https://www.google.com/intl/en_us/terms_google_news.html', 'Google News', 'none', 'Blocked in default commercial profile.'),
  ('aisstream', 'AISStream.io', 'dev_only', 'No formal ToS documented by upstream GEV', 'unverified_terms', 'https://aisstream.io/', 'AISStream.io', 'none', 'Development only until contractual/commercial usage terms are verified.'),
  ('telegeography', 'TeleGeography Submarine Cable Map', 'blocked', 'CC BY-NC-SA 3.0', 'cc_by_nc_sa_3_0', 'https://www.submarinecablemap.com/', 'TeleGeography', 'none', 'Bundled upstream dataset must be removed for default commercial profile.'),
  ('adsb_lol', 'adsb.lol', 'conditional', 'ODbL 1.0', 'odbl_1_0', 'https://adsb.lol/', 'adsb.lol contributors', 'normalized_only', 'Disabled by default until ODbL database/attribution obligations are implemented and reviewed.'),
  ('osm', 'OpenStreetMap', 'conditional', 'ODbL 1.0', 'odbl_1_0', 'https://www.openstreetmap.org/copyright', '© OpenStreetMap contributors', 'normalized_only', 'Commercially usable with ODbL obligations; disabled by default in clean profile until compliance path is explicit.'),
  ('tomtom', 'TomTom Traffic', 'conditional', 'Proprietary', 'proprietary_contract', 'https://developer.tomtom.com/', 'Traffic flow data © TomTom', 'transient_only', 'Enable only with an appropriate account/contract and retention policy.'),
  ('google_maps', 'Google Maps Platform', 'conditional', 'Proprietary', 'proprietary_visualization_only', 'https://cloud.google.com/maps-platform/terms', 'Google Maps', 'none', 'Visualization only; do not persist/rehost Google Maps Content. Enable with billing/key restrictions.')
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  policy = EXCLUDED.policy,
  license_name = EXCLUDED.license_name,
  license_class = EXCLUDED.license_class,
  terms_url = EXCLUDED.terms_url,
  attribution = EXCLUDED.attribution,
  storage_policy = EXCLUDED.storage_policy,
  commercial_note = EXCLUDED.commercial_note,
  updated_at = now();
