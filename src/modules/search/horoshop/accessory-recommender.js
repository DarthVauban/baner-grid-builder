export const ACCESSORY_RECOMMENDER_VERSION = 2;

const accessoryRules = [
  ['power_bank', /павербанк|power\s*bank|зовнішн.{0,8}акум/u],
  ['bag', /сумк|рюкзак|bag|backpack|чохол.{0,16}(ноут|laptop|macbook)/u],
  ['hub', /usb.{0,4}hub|\bhub\b|хаб|док.{0,5}станц|docking.{0,5}station/u],
  ['case', /чохол|футляр|бампер|\bcase\b|cover|sleeve/u],
  ['protector', /захисн.{0,12}(скл|плів)|скло|плівка|screen.{0,8}protector|tempered.{0,8}glass/u],
  ['charger', /(^|\s)(азп|мзп)(\s|$)|автомобільн.{0,16}заряд|мережев.{0,16}заряд|зарядн.{0,16}(пристр|адаптер|блок)|зарядка|адаптер.{0,8}живлен|power.{0,8}adapter|\bcharger\b/u],
  ['cable', /кабел|шнур|\bcable\b|data.{0,5}cable|charging.{0,5}cable/u],
  ['headphones', /навуш|гарнітур|earphone|headphone|airpods|\bbuds\b/u],
  ['holder', /тримач|holder|автотримач/u],
  ['stand', /підстав|\bstand\b|настільн.{0,8}тримач/u],
  ['keyboard', /клавіат|keyboard/u],
  ['mouse', /миш(а|ка)|\bmouse\b/u],
  ['strap', /ремінець|браслет|strap|band/u],
  ['memory_card', /карт.{0,8}пам.?ят|micro\s?sd|memory.{0,5}card/u],
  ['battery', /акумулятор|батаре(я|ї)|battery/u],
  ['cleaning', /чист(яч|к)|сервет|cleaning|догляд/u],
  ['remote', /пульт|remote/u],
  ['gamepad', /геймпад|джойстик|gamepad|joystick|dualsense|dualshock|xbox.{0,12}controller|nintendo.{0,12}controller|ігров.{0,8}контролер|gaming.{0,8}controller/u],
  ['stylus', /стилус|pencil|stylus/u],
  ['tripod', /штатив|tripod|монопод/u],
  ['soundbar', /саундбар|soundbar/u]
];

const productRules = [
  ['gamepad', /геймпад|джойстик|ігров.{0,8}(контролер|маніпулятор)|gamepad|joystick|dualsense|dualshock|xbox.{0,12}controller|nintendo.{0,12}controller|gaming.{0,8}controller/u],
  ['speaker', /портативн.{0,8}акуст|акустичн.{0,8}(систем|колон)|\bколонк|\bspeaker\b/u],
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
  headphones: { case: .96, cleaning: .64, stand: .56 },
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
  'чорний', 'чорна', 'білий', 'біла', 'зелений', 'синій', 'рожевий', 'червоний', 'сірий',
  'phone', 'smartphone', 'mobile', 'tablet', 'laptop', 'notebook', 'watch', 'smartwatch',
  'headphones', 'earphones', 'device', 'product', 'silicone', 'transparent', 'leather',
  'смартфон', 'телефон', 'планшет', 'ноутбук', 'навушники', 'товар', 'модель', 'серія',
  'смартфона', 'телефона', 'планшета', 'ноутбука', 'навушників', 'годинника',
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

function earliestClassification(text, rules) {
  let selected = null;
  for (const [kind, expression] of rules) {
    const match = expression.exec(text);
    if (match && (!selected || match.index < selected.index)) selected = { kind, index: match.index };
  }
  return selected;
}

function targetProfile(target) {
  const title = normalizedText(target.titles);
  const product = earliestClassification(title, productRules);
  const accessory = earliestClassification(title, accessoryRules);
  if (accessory && (!product || accessory.index < product.index)) {
    return { kind: null, isAccessory: true };
  }
  const category = normalizedText(target.categoryTitles);
  const categoryProduct = classify(category, productRules);
  const categoryAccessory = classify(category, accessoryRules);
  if (!product && categoryAccessory && categoryAccessory !== categoryProduct) {
    return { kind: null, isAccessory: true };
  }
  return {
    kind: product?.kind || categoryProduct,
    isAccessory: false
  };
}

function classifyAccessory(candidate) {
  const title = normalizedText(candidate.titles);
  return classify(title, accessoryRules)
    || classify(normalizedText(candidate.categoryTitles), accessoryRules);
}

function signatureTokens(text) {
  return new Set(text.split(/\s+/u).filter((token) => (
    token.length >= 4 || /\d/u.test(token)
  ) && !genericWords.has(token)));
}

const modelQualifiers = new Set(['pro', 'max', 'plus', 'ultra', 'mini', 'air', 'se', 'fe']);

const weakFamilyWords = new Set([
  ...genericWords, ...modelQualifiers,
  'apple', 'samsung', 'xiaomi', 'huawei', 'google', 'sony', 'microsoft', 'nintendo',
  'lenovo', 'asus', 'acer', 'dell', 'hp', 'canon', 'nikon', 'baseus', 'hoco', 'joyroom',
  'wireless', 'original', 'series', 'generation', 'універсальний', 'універсальна', 'оригінальний'
]);

function familyTokens(text) {
  const result = new Set();
  for (const token of text.split(/\s+/u)) {
    if (!/[\p{L}]/u.test(token)) continue;
    const alpha = token.replace(/\d+/gu, '');
    if (token.length >= 3 && !weakFamilyWords.has(token)) result.add(token);
    if (alpha.length >= 3 && !weakFamilyWords.has(alpha)) result.add(alpha);
  }
  return result;
}

function hasFamilyOverlap(targetText, candidateText) {
  return setOverlap(familyTokens(targetText), familyTokens(candidateText));
}

function modelMarkers(text) {
  const result = new Set();
  for (const token of text.split(/\s+/u)) {
    if (/^\d+(?:gb|tb|mb|w|kw|mah|wh|hz|khz|mhz|ghz|mm|cm|inch)$/u.test(token)) continue;
    if (/^\d{1,4}$/u.test(token) || (/\d/u.test(token) && /\p{L}/u.test(token))) result.add(token);
    const digits = token.match(/\d{1,4}/gu) || [];
    for (const value of digits) result.add(value);
  }
  return result;
}

function qualifiers(text) {
  return new Set(text.split(/\s+/u).filter((token) => modelQualifiers.has(token)));
}

function dimensions(text) {
  const result = new Set();
  for (const match of text.matchAll(/(?:^|\s)(\d+)\s*(mm|мм|cm|см|inch|дюйм\p{L}*)(?=\s|$)/gu)) {
    const unit = /^(mm|мм)$/u.test(match[2]) ? 'mm'
      : /^(cm|см)$/u.test(match[2]) ? 'cm' : 'inch';
    result.add(`${match[1]}${unit}`);
  }
  return result;
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

const purposeRules = {
  phone: /смартфон|мобільн.{0,7}телефон|для.{0,12}телефон|\biphone\b|\bsmartphone\b/u,
  tablet: /планшет|\bipad\b|\btablet\b/u,
  laptop: /ноутбук|\bmacbook\b|\blaptop\b|\bnotebook\b/u,
  smartwatch: /смарт.{0,5}годин|apple\s?watch|smart\s?watch|smartwatch/u,
  headphones: /навуш|гарнітур|airpods|\bbuds\b|earphone|headphone/u,
  tv: /телевізор|smart\s?tv|\btv\b/u,
  camera: /фотоапарат|відеокамер|\bcamera\b/u,
  console: /playstation|\bps[345]\b|xbox|nintendo|ігров.{0,5}консол|\bconsole\b/u,
  power_station: /зарядн.{0,8}станц|power.{0,5}station/u
};

function purposeKinds(text) {
  return new Set(Object.entries(purposeRules)
    .filter(([, expression]) => expression.test(text))
    .map(([kind]) => kind));
}

function ecosystems(text) {
  const found = new Set();
  if (/apple|iphone|ipad|airpods|macbook|magsafe|apple\s?watch|\bpencil\b/u.test(text)) found.add('apple');
  if (/samsung|galaxy|\bs\s?pen\b/u.test(text)) found.add('samsung');
  if (/xiaomi|redmi|\bpoco\b/u.test(text)) found.add('xiaomi');
  if (/huawei/u.test(text)) found.add('huawei');
  if (/honor/u.test(text)) found.add('honor');
  if (/google|\bpixel\b/u.test(text)) found.add('google');
  if (/lenovo/u.test(text)) found.add('lenovo');
  if (/motorola|\bmoto\b/u.test(text)) found.add('motorola');
  return found;
}

function platforms(text) {
  const found = new Set();
  if (/playstation\s?5|\bps\s?5\b|\bps5\b|dualsense/u.test(text)) found.add('ps5');
  if (/playstation\s?4|\bps\s?4\b|\bps4\b|dualshock/u.test(text)) found.add('ps4');
  if (/\bxbox\b/u.test(text)) found.add('xbox');
  if (/nintendo|\bswitch\b|joy\s?con/u.test(text)) found.add('switch');
  return found;
}

function storageInterfaces(text) {
  const found = new Set();
  if (/micro\s?sd/u.test(text)) found.add('micro-sd');
  if (/\bsd(xc|hc)?\b|карта.{0,8}sd/u.test(text)) found.add('sd');
  if (/cfexpress/u.test(text)) found.add('cfexpress');
  if (/\bxqd\b/u.test(text)) found.add('xqd');
  return found;
}

function audioInterfaces(text) {
  const found = new Set();
  if (/bluetooth|бездротов/u.test(text)) found.add('bluetooth');
  if (/3\s?5\s?mm|3\s?5\s?мм|mini\s?jack|аудіо.{0,5}розєм/u.test(text)) found.add('3.5mm');
  return found;
}

const purposeRestrictedAccessories = new Set([
  'case', 'protector', 'charger', 'cable', 'holder', 'stand', 'bag', 'keyboard',
  'strap', 'battery', 'remote', 'hub', 'stylus'
]);

function purposeMismatch(targetKind, accessoryKind, candidateText) {
  if (!purposeRestrictedAccessories.has(accessoryKind)) return false;
  const purposes = purposeKinds(candidateText);
  return purposes.size > 0 && !purposes.has(targetKind);
}

function ecosystemMismatch(targetText, candidateText) {
  const targetEcosystems = ecosystems(targetText);
  const candidateEcosystems = ecosystems(candidateText);
  return targetEcosystems.size > 0 && candidateEcosystems.size > 0
    && !setOverlap(targetEcosystems, candidateEcosystems);
}

function chargerContext(text) {
  if (/(^|\s)азп(\s|$)|автомобільн.{0,16}заряд|прикурювач|cigarette.{0,8}lighter|\bcar.{0,5}charger/u.test(text)) return 'car';
  if (/(^|\s)мзп(\s|$)|мережев.{0,16}заряд|настінн.{0,12}заряд|\bwall.{0,5}charger/u.test(text)) return 'wall';
  return 'unknown';
}

function maxWattage(text) {
  const values = [...text.matchAll(/(\d{2,3})\s?w\b/gu)].map((match) => Number(match[1]));
  return values.length > 0 ? Math.max(...values) : 0;
}

function mentionsPurpose(text, targetKind) {
  return purposeKinds(text).has(targetKind);
}

function connectorCompatibility(targetKind, accessoryKind, candidateText, targetConnectors, candidateConnectors, modelOverlap) {
  if (!['charger', 'cable', 'hub'].includes(accessoryKind)) return true;
  const connectorMatch = setOverlap(targetConnectors, candidateConnectors);
  if (targetConnectors.size > 0 && candidateConnectors.size > 0 && !connectorMatch) return false;

  if (accessoryKind === 'charger') {
    if (targetKind === 'laptop') {
      if (chargerContext(candidateText) === 'car') return false;
      if (modelOverlap >= .5) return true;
      return mentionsPurpose(candidateText, 'laptop')
        && targetConnectors.size > 0 && candidateConnectors.size > 0
        && connectorMatch && maxWattage(candidateText) >= 45;
    }
    if (targetKind === 'smartwatch') {
      return modelOverlap >= .5 || mentionsPurpose(candidateText, 'smartwatch');
    }
    if (targetKind === 'headphones') return false;
    if (['console', 'power_station'].includes(targetKind)) {
      return modelOverlap >= .5 || mentionsPurpose(candidateText, targetKind);
    }
  }

  if (accessoryKind === 'hub' && targetConnectors.size === 0) return false;
  if (targetConnectors.size === 0 && modelOverlap < .5) return false;
  return connectorMatch || modelOverlap >= .5;
}

function exactModelCompatibility(targetKind, accessoryKind, targetTitleText, candidateTitleText) {
  const targetMarkers = modelMarkers(targetTitleText);
  const candidateMarkers = modelMarkers(candidateTitleText);
  const targetQualifiers = qualifiers(targetTitleText);
  const candidateQualifiers = qualifiers(candidateTitleText);
  const targetDimensions = dimensions(targetTitleText);
  const candidateDimensions = dimensions(candidateTitleText);

  if (ecosystemMismatch(targetTitleText, candidateTitleText)) return false;
  if (accessoryKind === 'strap') {
    if (targetKind === 'camera') {
      return mentionsPurpose(candidateTitleText, 'camera') || hasFamilyOverlap(targetTitleText, candidateTitleText);
    }
    if (targetKind !== 'smartwatch') return false;
    if (!mentionsPurpose(candidateTitleText, 'smartwatch')
      && !hasFamilyOverlap(targetTitleText, candidateTitleText)) return false;
    return targetDimensions.size === 0 || candidateDimensions.size === 0
      || setOverlap(targetDimensions, candidateDimensions);
  }

  if (!hasFamilyOverlap(targetTitleText, candidateTitleText)) return false;
  if (targetMarkers.size > 0 && (candidateMarkers.size === 0 || !setOverlap(targetMarkers, candidateMarkers))) {
    return false;
  }
  if (!equalSets(targetQualifiers, candidateQualifiers)) return false;
  return targetDimensions.size === 0 || candidateDimensions.size === 0
    || setOverlap(targetDimensions, candidateDimensions);
}

function headphonesCompatibility(targetKind, targetText, candidateText, targetConnectors, candidateConnectors) {
  if (targetKind === 'console') {
    const targetPlatforms = platforms(targetText);
    const candidatePlatforms = platforms(candidateText);
    return targetPlatforms.size > 0 && candidatePlatforms.size > 0
      && setOverlap(targetPlatforms, candidatePlatforms);
  }
  if (setOverlap(targetConnectors, candidateConnectors)) return true;
  const targetAudio = audioInterfaces(targetText);
  const candidateAudio = audioInterfaces(candidateText);
  if (setOverlap(targetAudio, candidateAudio)) return true;
  return candidateAudio.has('bluetooth') && ['phone', 'tablet', 'laptop'].includes(targetKind);
}

function semanticCompatibility({
  targetKind, accessoryKind, targetTitleText, targetText,
  candidateTitleText, candidatePurposeText, candidateText,
  targetConnectors, candidateConnectors, modelOverlap
}) {
  if (purposeMismatch(targetKind, accessoryKind, candidatePurposeText)) return false;

  if (['case', 'protector', 'strap', 'battery'].includes(accessoryKind)) {
    return exactModelCompatibility(targetKind, accessoryKind, targetTitleText, candidateTitleText);
  }

  if (['charger', 'cable', 'hub'].includes(accessoryKind)) {
    return connectorCompatibility(
      targetKind, accessoryKind, candidateText,
      targetConnectors, candidateConnectors, modelOverlap
    );
  }

  if (accessoryKind === 'bag') {
    return mentionsPurpose(candidatePurposeText, targetKind)
      || hasFamilyOverlap(targetTitleText, candidateTitleText);
  }
  if (accessoryKind === 'stand') {
    return mentionsPurpose(candidatePurposeText, targetKind)
      || hasFamilyOverlap(targetTitleText, candidateTitleText);
  }
  if (accessoryKind === 'holder') return targetKind === 'phone';
  if (accessoryKind === 'remote') {
    if (/кондиціонер|air.{0,5}condition|клімат|воріт|гараж/u.test(candidatePurposeText)) return false;
    return targetKind === 'tv' && (
      mentionsPurpose(candidatePurposeText, 'tv')
      || /універсальн.{0,12}пульт|universal.{0,12}remote/u.test(candidatePurposeText)
      || hasFamilyOverlap(targetTitleText, candidateTitleText)
    );
  }
  if (accessoryKind === 'stylus') {
    if (targetKind !== 'tablet' || ecosystemMismatch(targetTitleText, candidateTitleText)) return false;
    return mentionsPurpose(candidatePurposeText, 'tablet')
      || /універсальн|capacitive|ємнісн/u.test(candidatePurposeText)
      || hasFamilyOverlap(targetTitleText, candidateTitleText);
  }
  if (accessoryKind === 'gamepad') {
    const targetPlatforms = platforms(targetText);
    const candidatePlatforms = platforms(candidateText);
    return targetKind === 'console' && targetPlatforms.size > 0 && candidatePlatforms.size > 0
      && setOverlap(targetPlatforms, candidatePlatforms);
  }
  if (accessoryKind === 'memory_card') {
    const targetStorage = storageInterfaces(targetText);
    const candidateStorage = storageInterfaces(candidateText);
    return targetKind === 'camera' && targetStorage.size > 0 && candidateStorage.size > 0
      && setOverlap(targetStorage, candidateStorage);
  }
  if (accessoryKind === 'headphones') {
    return headphonesCompatibility(targetKind, targetText, candidateText, targetConnectors, candidateConnectors);
  }
  if (accessoryKind === 'power_bank' && /magsafe/u.test(candidateText)) {
    return ecosystems(targetTitleText).has('apple') || /magsafe/u.test(targetText);
  }
  return true;
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
  const profile = targetProfile(target);
  const targetKind = profile.kind;
  if (!targetKind || profile.isAccessory || !utilityWeights[targetKind]) return [];
  const targetModelText = targetTitleText;
  const targetTokens = signatureTokens(targetModelText);
  const targetConnectors = connectors(targetText);
  const maxPopularity = Math.max(1, ...candidates.map((candidate) => numericPopularity(candidate.popularity)));

  const scored = candidates.map((candidate) => {
    if (candidate.id === target.id) return null;
    const candidateTitleText = normalizedText(candidate.titles);
    const candidateText = normalizedText([
      candidate.titles, candidate.brand, candidate.categoryTitles, candidate.characteristics
    ]);
    const candidatePurposeText = normalizedText([candidate.titles, candidate.categoryTitles]);
    const titleAccessoryKind = classify(candidateTitleText, accessoryRules);
    const candidateProductKind = classify(candidateTitleText, productRules);
    if (candidateProductKind && !titleAccessoryKind) return null;
    const accessoryKind = classifyAccessory(candidate);
    const utility = accessoryKind ? utilityWeights[targetKind]?.[accessoryKind] || 0 : 0;
    if (!accessoryKind || utility < .55) return null;

    const modelOverlap = overlapScore(targetTokens, signatureTokens(candidateTitleText));
    const sameBrand = Boolean(target.brand && candidate.brand
      && normalizedText(target.brand) === normalizedText(candidate.brand));
    const candidateConnectors = connectors(candidateText);
    const connectorMatch = setOverlap(targetConnectors, candidateConnectors);
    const modelSpecific = ['case', 'protector', 'strap', 'battery'].includes(accessoryKind);
    const connectorDependent = ['charger', 'cable', 'hub'].includes(accessoryKind);
    if (!semanticCompatibility({
      targetKind, accessoryKind, targetTitleText, targetText,
      candidateTitleText, candidatePurposeText, candidateText,
      targetConnectors, candidateConnectors, modelOverlap
    })) return null;

    let compatibility = modelSpecific ? Math.max(.7, .42 + modelOverlap * .55) : .7;
    if (sameBrand) compatibility += modelSpecific ? .05 : .04;
    if (connectorMatch) compatibility += connectorDependent ? .14 : .06;
    if (!modelSpecific && modelOverlap >= .5) compatibility += .08;
    compatibility = rounded(compatibility);
    if (compatibility < .65) return null;
    const available = availabilityScore(candidate.availabilities || []);
    if (available === 0 || candidate.visible === false || candidate.active === false) return null;
    const popularity = numericPopularity(candidate.popularity) > 0
      ? Math.log1p(numericPopularity(candidate.popularity)) / Math.log1p(maxPopularity)
      : .35;
    const total = rounded(compatibility * .45 + utility * .25 + available * .2 + popularity * .1);
    if (total < .62) return null;

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
