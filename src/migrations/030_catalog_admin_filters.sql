CREATE INDEX used_smartphone_products_code_lower_idx
  ON used_smartphone_products(lower(product_code));

CREATE INDEX used_smartphone_products_price_idx
  ON used_smartphone_products(price_uah);

CREATE INDEX used_smartphone_products_stock_idx
  ON used_smartphone_products(stock_count, incoming_count);

CREATE INDEX used_smartphone_product_characteristics_template_idx
  ON used_smartphone_product_characteristics(template_id, product_id);

CREATE INDEX used_smartphone_product_characteristics_filter_text_idx
  ON used_smartphone_product_characteristics(key, value_text, product_id);
