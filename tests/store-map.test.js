import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractStoreMapCity,
  isStoreMapPointOpen,
  parseStoreMapCoordinate,
  sanitizeStoreMapSvg,
  scheduleFromHoursText
} from '../src/modules/store-map/store-map.service.js';

test('parses coordinates from Google Maps links and raw pairs', () => {
  assert.deepEqual(
    parseStoreMapCoordinate('https://www.google.com/maps?q=49.792124,23.153401'),
    { latitude: 49.792124, longitude: 23.153401 }
  );
  assert.deepEqual(
    parseStoreMapCoordinate('48.319809,35.503456'),
    { latitude: 48.319809, longitude: 35.503456 }
  );
  assert.equal(parseStoreMapCoordinate('https://www.google.com/maps?q=1111,1111'), null);
});

test('extracts Ukrainian city names from imported titles', () => {
  assert.equal(extractStoreMapCity('м. Мостиська, вул. Галицька, 2'), 'Мостиська');
  assert.equal(extractStoreMapCity('смт. Бородянка (Київська обл)'), 'Бородянка');
  assert.equal(extractStoreMapCity('Черкаси'), 'Черкаси');
});

test('builds a Kyiv schedule and resolves manual overrides', () => {
  const schedule = scheduleFromHoursText('08:00 - 19:30');
  assert.deepEqual(schedule.days.mon, [{ open: '08:00', close: '19:30' }]);
  assert.equal(isStoreMapPointOpen({ schedule, openStatusOverride: 'OPEN' }), true);
  assert.equal(isStoreMapPointOpen({ schedule, openStatusOverride: 'CLOSED' }), false);
});

test('accepts simple SVG markers and rejects executable SVG', () => {
  assert.equal(
    sanitizeStoreMapSvg('<svg viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>'),
    '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>'
  );
  assert.throws(
    () => sanitizeStoreMapSvg('<svg onload="alert(1)"><path/></svg>'),
    /небезпечні/
  );
});
