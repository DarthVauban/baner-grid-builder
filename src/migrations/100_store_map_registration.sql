CREATE TABLE store_map_registration_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  label VARCHAR(180) NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ
);

CREATE TABLE store_map_registration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL UNIQUE REFERENCES store_map_registration_links(id),
  status VARCHAR(20) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'APPROVED', 'REJECTED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  name VARCHAR(240) NOT NULL,
  city VARCHAR(120) NOT NULL,
  address VARCHAR(500) NOT NULL,
  hours_text VARCHAR(120) NOT NULL,
  latitude NUMERIC(10, 7) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(10, 7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  submitted_data JSONB NOT NULL CHECK (jsonb_typeof(submitted_data) = 'object'),
  measurement JSONB NOT NULL CHECK (jsonb_typeof(measurement) = 'object'),
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  point_id UUID UNIQUE REFERENCES store_map_points(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX store_map_registration_requests_status_date_idx
  ON store_map_registration_requests(status, created_at DESC);
