const accessoryRules = [
  ['case', /чохол|футляр|бампер|\bcase\b|cover|sleeve/u],
  ['protector', /захисн.{0,12}(скл|плів)|скло|плівка|screen.{0,8}protector|tempered.{0,8}glass/u],
  ['charger', /заряд|адаптер.{0,8}живлен|power.{0,8}adapter|\bcharger\b|magsafe/u],
  ['cable', /кабел|шнур|\bcable\b|lightning|usb[\s-]?[ca]\b/u],
  ['power_bank', /павербанк|power.{0,4}bank|зовнішн.{0,8}акум/u],
  ['headphones', /навуш|гарнітур|earphone|headphone|airpods|\bbuds\b/u],
  ['holder', /тримач|holder|автотримач/u],
  ['stand', /підстав|stand|док.{0,5}станц|dock/u],
  ['bag', /сумк|рюкзак|чохол.{0,8}ноут|bag|backpack/u],
  ['keyboard', /клавіат|keyboard/u],
  ['mouse', /миш(а|ка)|\bmouse\b/u],
  ['strap', /ремінець|браслет|strap|band/u],
  ['memory_card', /карт.{0,8}пам.?ят|micro\s?sd|memory.{0,5}card/u],
  ['battery', /акумулятор|батаре(я|ї)|battery/u],
  ['cleaning', /чист(яч|к)|сервет|cleaning|догляд/u],
  ['remote', /пульт|remote/u],
  ['gamepad', /геймпад|контролер|gamepad|controller/u],
  ['hub', /usb.{0,4}hub|хаб|перехідник|adapter hub|док.{0,5}станц/u],
  ['stylus', /стилус|pencil|stylus/u],
  ['tripod', /штатив|tripod|монопод/u],
  ['soundbar', /саундбар|soundbar/u]
];

const productRules = [
  ['phone', /смартфон|мобільн.{0,7}телефон|\biphone\b|\bsmartphone\b/u],
  ['tablet', /планшет|\bipad\b|\btablet\b/u],
  ['laptop', /ноутбук|\bmacbook\b|\blaptop\b/u],
  ['smartwatch', /смарт.{0,5}годин|розумн.{0,5}годин|smart\s?watch|apple\s?watch/u],
  ['headphones', /навуш|гарнітур|earphone|headphone|airpods|\bbuds\b/u],
  ['tv', /телевізор|smart\s?tv|\btv\b/u],
  ['camera', /фотоапарат|відеокамер|\bcamera\b/u],
  ['console', /playstation|\bps[345]\b|xbox|nintendo|ігров.{0,5}консол|console/u],
  ['power_station', /зарядн.{0,8}станц|power.{0,5}station/u]
];

const utilityWeights = {
  phone: { case: 1, protector: .98, charger: .9, cable: .86, power_bank: .78, headphones: .72, holder: .68, cleaning: .48 },
  tablet: { case: 1, protector: .95, keyboard: .9, stylus: .86, charger: .84, cable: .78, stand: .72, bag: .68, cleaning: .45 },
  laptop: { bag: 1, mouse: .94, hub: .92, stand: .84, charger: .8, keyboard: .68, headphones: .62, cleaning: .5 },
  smartwatch: { strap: 1, charger: .92, protector: .86, case: .76, cleaning: .46 },
  headphones: { case: .96, charger: .82, cable: .76, cleaning: .64, stand: .56, adapter: .5 },
  tv: { soundbar: 1, remote: .88, stand: .82, cable: .78, headphones: .55, cleaning: .45 },
  camera: { memory_card: 1, bag: .94, battery: .9, tripod: .84, strap: .72, cleaning: .7, cable: .5 },
  console: { gamepad: 1, headphones: .9, charger: .78, cable: .72, stand: .62 },
  power_station: { cable: .82, charger: .62, bag: .55 }
};

const kindLabels = {
  case: 'захист і зберігання', protector: 'захист екрана', charger: 'заряджання',
  cable: 'підключення та заряджання', power_bank: 'автономне живлення', headphones: 'особисте аудіо',
  holder: 'зручне розміщення', stand: 'зручне розміщення', bag: 'транспортування',
  keyboard: 'зручне введення', mouse: 'зручне керування', strap: 'заміна ремінця',
  memory_card: 'розширення памʼяті', battery: 'додаткове живлення', cleaning: 'догляд',
  remote: 'дистанційне керування', gamepad: 'ігрове керування', hub: 'розширення портів',
  stylus: 'точне введення', tripod: 'стабільна зйомка', soundbar: 'покращення звуку'
};

const genericWords = new Set([
  'bluetooth', 'active', 'black', 'white', 'green', 'blue', 'pink', 'red', 'gray', 'grey',
  'смартфон', 'телефон', 'планшет', 'ноутбук', 'навушники', 'товар', 'модель', 'серія',
  'case', 'cover', 'чохол', 'скло', 'плівка', 'кабель', 'зарядний', 'зарядка', 'для', 'with'
]);

function textValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(textValue).join(' ');
  if (typeof value === 'object') return Object.values(value).map(textValue).join(' ');
  return String(value);
}

function normalizedText(value) {
  return textValue(value).toLocaleLowerCase('uk-UA').replace(/[’']/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function classify(text, rules) {
  return rules.find(([, expression]) => expression.test(text))?.[0] || null;
}

function signatureTokens(text) {
  return new Set(text.split(/\s+/u).filter((token) => (
    token.length >= 4 || /\d/u.test(token)
  ) && !genericWords.has(token)));
}

const modelQualifiers = new Set(['pro', 'max', 'plus', 'ultra', 'mini', 'air', 'se', 'fe']);

function modelMarkers(text) {
  return new Set(text.split(/\s+/u).filter((token) => {
    if (/^\d+(?:gb|tb|mb|w|kw|mah|wh|hz|khz|mhz|ghz|mm|cm|inch)$/u.test(token)) return false;
    return /^\d{1,4}$/u.test(token) || (/\d/u.test(token) && /\p{L}/u.test(token));
  }));
}

function qualifiers(text) {
  return new Set(text.split(/\s+/u).filter((token) => modelQualifiers.has(token)));
}

function dimensions(text) {
  return new Set(text.split(/\s+/u).filter((token) => /^\d+(?:mm|cm|inch)$/u.test(token)));
}

function equalSets(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function overlapScore(targetTokens, candidateTokens) {
  if (targetTokens.size === 0) return 0;
  let matches = 0;
  for (const token of targetTokens) if (candidateTokens.has(token)) matches += 1;
  return Math.min(1, matches / Math.min(4, targetTokens.size));
}

function connectors(text) {
  const found = new Set();
  if (/usb\s?c|type\s?c/u.test(text)) found.add('usb-c');
  if (/lightning/u.test(text)) found.add('lightning');
  if (/magsafe/u.test(text)) found.add('magsafe');
  if (/\bqi\b|wireless.{0,7}charg|бездротов.{0,7}заряд/u.test(text)) found.add('qi');
  if (/micro\s?usb/u.test(text)) found.add('micro-usb');
  if (/hdmi/u.test(text)) found.add('hdmi');
  return found;
}

function setOverlap(left, right) {
  for (const value of left) if (right.has(value)) return true;
  return false;
}

function availabilityScore(values) {
  if (values.length === 0) return .55;
  let waiting = false;
  let unknown = false;
  for (const value of values) {
    const normalized = normalizedText(value);
    if (!normalized) {
      unknown = true;
      continue;
    }
    if (/очіку|під замовлення|предзаказ|preorder|wait/u.test(normalized)) waiting = true;
    else if (!/немає|відсут|нет в налич|out of stock|not available|^0$/u.test(normalized)) return 1;
  }
  if (waiting) return .48;
  if (unknown) return .55;
  return 0;
}

function numericPopularity(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function rounded(value) {
  return Math.round(Math.max(0, Math.min(1, value)) * 10_000) / 10_000;
}

function diversified(items, limit) {
  const counts = new Map();
  const selected = [];
  for (const item of items) {
    const cap = ['case', 'protector', 'strap'].includes(item.accessoryKind) ? 3 : 2;
    const count = counts.get(item.accessoryKind) || 0;
    if (count >= cap) continue;
    counts.set(item.accessoryKind, count + 1);
    const result = { ...item };
    delete result.accessoryKind;
    selected.push(result);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function recommendAccessories(target, candidates, limit = 12) {
  const targetTitleText = normalizedText(target.titles);
  const targetText = normalizedText([
    target.titles, target.brand, target.categoryTitles, target.characteristics
  ]);
  const targetKind = classify(targetText, productRules);
  if (!targetKind) return [];
  const targetAccessoryKind = classify(targetTitleText, accessoryRules);
  if (targetAccessoryKind && !['headphones', 'power_station'].includes(targetKind)) return [];
  const targetModelText = normalizedText([target.titles, target.characteristics]);
  const targetTokens = signatureTokens(targetModelText);
  const targetModelMarkers = modelMarkers(targetModelText);
  const targetQualifiers = qualifiers(targetModelText);
  const targetDimensions = dimensions(targetModelText);
  const targetConnectors = connectors(targetText);
  const maxPopularity = Math.max(1, ...candidates.map((candidate) => numericPopularity(candidate.popularity)));

  const scored = candidates.map((candidate) => {
    if (candidate.id === target.id) return null;
    const candidateTitleText = normalizedText(candidate.titles);
    const candidateText = normalizedText([
      candidate.titles, candidate.brand, candidate.categoryTitles, candidate.characteristics
    ]);
    const titleAccessoryKind = classify(candidateTitleText, accessoryRules);
    const candidateProductKind = classify(normalizedText([candidate.titles, candidate.categoryTitles]), productRules);
    if (candidateProductKind && !titleAccessoryKind) return null;
    const accessoryKind = titleAccessoryKind || classify(candidateText, accessoryRules);
    const utility = accessoryKind ? utilityWeights[targetKind]?.[accessoryKind] || 0 : 0;
    if (!accessoryKind || utility <= 0) return null;

    const modelOverlap = overlapScore(targetTokens, signatureTokens(candidateText));
    const candidateModelMarkers = modelMarkers(candidateText);
    const candidateQualifiers = qualifiers(candidateText);
    const candidateDimensions = dimensions(candidateText);
    const sameBrand = Boolean(target.brand && candidate.brand
      && normalizedText(target.brand) === normalizedText(candidate.brand));
    const candidateConnectors = connectors(candidateText);
    const connectorMatch = setOverlap(targetConnectors, candidateConnectors);
    const modelSpecific = ['case', 'protector', 'strap', 'battery'].includes(accessoryKind);
    if (modelSpecific) {
      if (targetModelMarkers.size > 0 && candidateModelMarkers.size > 0
        && !setOverlap(targetModelMarkers, candidateModelMarkers)) return null;
      if (!equalSets(targetQualifiers, candidateQualifiers)) return null;
      if (targetDimensions.size > 0 && candidateDimensions.size > 0
        && !setOverlap(targetDimensions, candidateDimensions)) return null;
      if (modelOverlap < .25) return null;
    }

    const connectorDependent = ['charger', 'cable', 'hub'].includes(accessoryKind);
    if (connectorDependent && targetConnectors.size > 0 && candidateConnectors.size > 0 && !connectorMatch) {
      return null;
    }

    let compatibility = modelSpecific ? .35 + modelOverlap * .55 : .68;
    if (sameBrand) compatibility += .1;
    if (connectorMatch) compatibility += .18;
    if (connectorDependent && targetConnectors.size > 0 && !connectorMatch) {
      compatibility -= .1;
    }
    compatibility = rounded(compatibility);
    const available = availabilityScore(candidate.availabilities || []);
    if (available === 0 || candidate.visible === false || candidate.active === false) return null;
    const popularity = numericPopularity(candidate.popularity) > 0
      ? Math.log1p(numericPopularity(candidate.popularity)) / Math.log1p(maxPopularity)
      : .35;
    const total = rounded(compatibility * .45 + utility * .25 + available * .2 + popularity * .1);
    if (total < .58) return null;

    const compatibilityReason = modelOverlap >= .5
      ? 'модель явно збігається'
      : connectorMatch ? 'інтерфейс підключення збігається' : 'універсально сумісний тип';
    return {
      productId: candidate.id,
      compatibilityScore: compatibility,
      utilityScore: rounded(utility),
      availabilityScore: rounded(available),
      popularityScore: rounded(popularity),
      totalScore: total,
      accessoryKind,
      reason: `${kindLabels[accessoryKind]}: ${compatibilityReason}; товар доступний для продажу.`
    };
  }).filter(Boolean)
    .sort((left, right) => right.totalScore - left.totalScore || left.productId.localeCompare(right.productId));
  return diversified(scored, Math.max(1, Math.min(limit, 16)));
}
