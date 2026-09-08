import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createPopupTimerRuntime, normalizeTimerConfig } from '../src/modules/popup-banners/popup-timer.js';

function setup(t) {
  const dom = new JSDOM('<main></main>', { url: 'https://shop.example.com/', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const browser = dom.window;
  let timestamp = Date.parse('2026-09-08T10:00:00Z');
  browser.Date.now = () => timestamp;
  const intervals = new Map();
  let nextId = 0;
  browser.setInterval = (callback) => { intervals.set(++nextId, callback); return nextId; };
  browser.clearInterval = (id) => intervals.delete(id);
  return {
    browser, runtime: createPopupTimerRuntime(browser), container: browser.document.querySelector('main'), intervals,
    advance(ms) { timestamp += ms; for (const callback of intervals.values()) callback(); }
  };
}

const campaign = { publicId: 'offer', type: 'countdown', revision: 'v1', timerConfig: { mode: 'duration', durationMinutes: 1, deadlineAt: null } };

test('personal countdown survives runtime recreation and copy revisions, and never restarts after expiry', (t) => {
  const { runtime, browser, container, advance, intervals } = setup(t);
  let expired = 0;
  const dispose = runtime.start(campaign, false).mount(container, () => expired++);
  assert.match(container.textContent, /01Хвилини00Секунди/);
  advance(20000);
  dispose();
  container.replaceChildren();
  createPopupTimerRuntime(browser).start({ ...campaign, revision: 'changed-copy' }, false).mount(container, () => expired++);
  assert.match(container.textContent, /00Хвилини40Секунди/);
  advance(40000);
  assert.equal(expired, 1);
  assert.equal(intervals.size, 0);
  assert.equal(createPopupTimerRuntime(browser).start(campaign, false).expired, true);
});

test('deadline countdown uses server time and expires immediately after a background clock jump', (t) => {
  const { runtime, browser, container, advance, intervals } = setup(t);
  const serverNow = '2026-09-08T13:00:00Z';
  runtime.sync(serverNow);
  const deadlineCampaign = { ...campaign, timerConfig: { ...campaign.timerConfig, mode: 'deadline', deadlineAt: '2026-09-08T16:01:00+03:00' } };
  let expired = false;
  runtime.start(deadlineCampaign, false).mount(container, () => { expired = true; });
  assert.match(container.textContent, /01Хвилини00Секунди/);
  browser.Date.now = () => Date.parse('2026-09-08T10:05:00Z');
  browser.document.dispatchEvent(new browser.Event('visibilitychange'));
  assert.equal(expired, true);
  assert.equal(intervals.size, 0);
  advance(0);
});

test('preview neither consumes nor overwrites a visitor countdown', (t) => {
  const { runtime, browser, container, advance } = setup(t);
  const dispose = runtime.start(campaign, true).mount(container, () => {});
  assert.equal(browser.localStorage.length, 0);
  assert.equal(browser.sessionStorage.length, 0);
  advance(60000);
  dispose();
  assert.equal(runtime.start(campaign, false).expired, false);
  const key = browser.localStorage.key(0);
  const deadline = browser.localStorage.getItem(key);
  runtime.start(campaign, true);
  assert.equal(browser.localStorage.getItem(key), deadline);
});

test('denied browser storage still renders and retains the timer within the page', (t) => {
  const { browser, runtime, advance } = setup(t);
  for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(browser, name, {
    get() { throw new Error('Storage denied'); }
  });
  const storage = runtime.storage('localStorage');
  storage.setItem('visitor', 'test-visitor');
  assert.equal(storage.getItem('visitor'), 'test-visitor');
  assert.equal(runtime.start(campaign, false).expired, false);
  advance(60000);
  assert.equal(runtime.start(campaign, false).expired, true);
});

test('expired and missing deadlines cannot render, and countdown cleanup removes callbacks', (t) => {
  const { runtime, container, intervals, advance } = setup(t);
  for (const deadlineAt of [null, 'invalid', '2026-09-08T09:59:59Z']) {
    assert.equal(runtime.start({ ...campaign, timerConfig: { ...campaign.timerConfig, mode: 'deadline', deadlineAt } }, false).expired, true);
  }
  let expired = false;
  const dispose = runtime.start(campaign, false).mount(container, () => { expired = true; });
  dispose();
  assert.equal(intervals.size, 0);
  advance(120000);
  assert.equal(expired, false);
  assert.equal(runtime.start({ ...campaign, type: 'message' }, false), null);
  assert.deepEqual(normalizeTimerConfig(null), { mode: 'duration', deadlineAt: null, durationMinutes: 15 });
});
