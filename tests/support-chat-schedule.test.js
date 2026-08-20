import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWithinSupportWorkingHours,
  normalizeSupportWorkingHoursSchedule
} from '../src/modules/support-chat/support-chat.service.js';

const schedule = normalizeSupportWorkingHoursSchedule({});
const enabledSettings = {
  workingHoursEnabled: true,
  workingHoursTimezone: 'Europe/Kyiv',
  workingHoursSchedule: schedule
};

test('support working hours use the configured timezone and end exclusively', () => {
  assert.equal(isWithinSupportWorkingHours(enabledSettings, new Date('2026-08-17T07:30:00.000Z')), true);
  assert.equal(isWithinSupportWorkingHours(enabledSettings, new Date('2026-08-17T15:00:00.000Z')), false);
  assert.equal(isWithinSupportWorkingHours(enabledSettings, new Date('2026-08-16T09:00:00.000Z')), false);
});

test('disabled working-hour restrictions preserve the always-online behavior', () => {
  assert.equal(isWithinSupportWorkingHours({ ...enabledSettings, workingHoursEnabled: false }, new Date('2026-08-16T09:00:00.000Z')), true);
});
