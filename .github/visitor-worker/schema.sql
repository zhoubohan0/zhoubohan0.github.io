-- Aggregate page visits only. No IP addresses, cookies or personal identifiers.
CREATE TABLE IF NOT EXISTS visitor_totals (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  visits INTEGER NOT NULL DEFAULT 0,
  last_visit_at TEXT
);
INSERT OR IGNORE INTO visitor_totals (id, visits) VALUES (1, 0);
CREATE TABLE IF NOT EXISTS visitor_days (
  day TEXT PRIMARY KEY,
  visits INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS visitor_places (
  location_key TEXT PRIMARY KEY,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  visits INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS visitor_places_visits ON visitor_places(visits DESC);
CREATE TABLE IF NOT EXISTS visitor_events (
  event_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  day TEXT NOT NULL,
  country TEXT,
  city TEXT,
  latitude REAL,
  longitude REAL,
  location_key TEXT,
  observed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS visitor_events_expiry ON visitor_events(created_at);

-- This application cap keeps accepted writes well below the Free allocation.
-- The Cloudflare account must additionally remain on Workers Free: its platform
-- quotas fail closed rather than billing overages. The cap is not a billing plan.
CREATE TRIGGER IF NOT EXISTS visitor_events_daily_cap BEFORE INSERT ON visitor_events
WHEN COALESCE((SELECT visits FROM visitor_days WHERE day = NEW.day), 0) >= 5000
BEGIN
  SELECT RAISE(IGNORE);
END;
CREATE TRIGGER IF NOT EXISTS visitor_events_aggregate AFTER INSERT ON visitor_events
BEGIN
  UPDATE visitor_totals SET visits = visits + 1, last_visit_at = NEW.observed_at WHERE id = 1;
  INSERT INTO visitor_days(day, visits) VALUES (NEW.day, 1)
    ON CONFLICT(day) DO UPDATE SET visits = visits + 1;
  INSERT INTO visitor_places(location_key, country, city, latitude, longitude, visits)
    SELECT NEW.location_key, NEW.country, NEW.city, NEW.latitude, NEW.longitude, 1
    WHERE NEW.location_key IS NOT NULL
    ON CONFLICT(location_key) DO UPDATE SET visits = visits + 1;
END;
