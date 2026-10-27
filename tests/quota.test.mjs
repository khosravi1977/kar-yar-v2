import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshEnv } from './helpers/env.mjs';

beforeEach(() => { freshEnv(); });

function attach() {
  const calls = { notices: [], bannerHiddenHistory: [] };
  const banner = { hidden: true };
  KarQuota.attach({
    showNotice: (t) => calls.notices.push(t),
    banner
  });
  return { calls, banner };
}

test('QuotaExceededError ⇒ پیام فارسی دقیق + نمایش بنر', () => {
  const { calls, banner } = attach();
  KarQuota.show({ name: 'QuotaExceededError', isQuota: true });
  assert.equal(calls.notices.length, 1);
  assert.equal(calls.notices[0], KarQuota.MESSAGE);
  assert.ok(KarQuota.MESSAGE.includes('خروجی پشتیبان'), 'مسیر پشتیبان‌گیری در پیام هست');
  assert.equal(banner.hidden, false);
});

test('خطای غیر-quota ⇒ پیام شامل نام خطا، نه پیام موفقیت کاذب', () => {
  const { calls } = attach();
  KarQuota.show({ name: 'TypeError' });
  assert.ok(calls.notices[0].includes('TypeError'));
  assert.ok(calls.notices[0].includes('ذخیره نشده'), 'صریحاً بگوید ذخیره نشد');
});

test('show بدون خطا هم پیام امن دارد', () => {
  const { calls } = attach();
  KarQuota.show();
  assert.equal(calls.notices.length, 1);
});

test('clear بنر را پنهان می‌کند', () => {
  const { banner } = attach();
  KarQuota.show({ name: 'QuotaExceededError', isQuota: true });
  assert.equal(banner.hidden, false);
  KarQuota.clear();
  assert.equal(banner.hidden, true);
});

test('show خطا را در logger ثبت می‌کند (بدون حلقه)', () => {
  const { calls } = attach();
  KarQuota.show({ name: 'QuotaExceededError', isQuota: true });
  const exported = JSON.parse(KarLogger.exportText());
  assert.ok(exported.entries.some(e => e.message === 'storage_show_error'));
});
