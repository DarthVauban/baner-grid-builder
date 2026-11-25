CREATE TABLE thematic_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES search_horoshop_connections(id) ON DELETE CASCADE,
  generation UUID NOT NULL,
  name TEXT NOT NULL,
  sections JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX thematic_campaigns_owner_idx ON thematic_campaigns(user_id, updated_at DESC);

CREATE TABLE thematic_campaign_items (
  campaign_id UUID NOT NULL REFERENCES thematic_campaigns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES search_horoshop_products(id) ON DELETE CASCADE,
  section_id UUID NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (campaign_id, product_id)
);

CREATE INDEX thematic_campaign_items_section_idx ON thematic_campaign_items(campaign_id, section_id, position);
CREATE INDEX thematic_campaign_items_position_idx ON thematic_campaign_items(campaign_id, position);
