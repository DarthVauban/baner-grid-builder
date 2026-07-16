ALTER TABLE used_smartphone_characteristic_template_fields
  DROP CONSTRAINT IF EXISTS used_smartphone_characteristic_template_fields_type_check;

ALTER TABLE used_smartphone_characteristic_template_fields
  DROP CONSTRAINT IF EXISTS used_smartphone_characteristic_template_fields_constraint_1;

ALTER TABLE used_smartphone_characteristic_template_fields
  ADD CONSTRAINT used_smartphone_characteristic_template_fields_type_check
  CHECK (type IN ('text', 'number', 'select', 'multiselect', 'boolean', 'color'));
