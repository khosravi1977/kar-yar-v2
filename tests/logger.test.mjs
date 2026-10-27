import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshEnv } from './helpers/env.mjs';

beforeEach(() => { freshEnv(); });

const entries = () => JSON.parse(KarLogger.exportText()).entries;

test('خروجی لاگ JSON معتبر با ساختار استاندارد', () => {
  KarLogger.log('info', 'hello', { a: 1 });
  const exported = JSON.parse(KarLogger.exportText());
  assert.equal(exported.app, 'kar-yar');
  assert.equal(typeof exported.exportedAt, 'string');
  assert.equal(exported.entries.length, 1);
  assert.equal(exported.entries[0].level, 'info');
  assert.equal(exported.entries[0].message, 'hello');
});

test('سقف ۱۰۰ رویداد: ۱۵۰ رویداد ⇒ ۱۰۰ تای آخر (حذف قدیمی‌ها)', () => {
  for (let i = 0; i < 150; i++) KarLogger.log('info', 'm' + i);
  const e = entries();
  assert.equal(e.length, 100);
  assert.equal(e[0].message, 'm50', 'قدیمی‌تر از m50 حذف شده');
  assert.equal(e[99].message, 'm149');
});

test('دادهٔ حساس ماسک می‌شود (description/token/password/history)', () => {
  KarLogger.log('warn', 'ctx', { description: 'راز کاربر', token: 'abc', password: 'x', history: [1], ok: 42 });
  const ctx = entries()[0].ctx;
  assert.equal(ctx.description, '[مخفی]');
  assert.equal(ctx.token, '[مخفی]');
  assert.equal(ctx.password, '[مخفی]');
  assert.equal(ctx.history, '[مخفی]');
  assert.equal(ctx.ok, 42);
});

test('رشته‌های بلند کوتاه و عمق زیاد بریده می‌شود', () => {
  KarLogger.log('info', 'long', { s: 'x'.repeat(500) });
  KarLogger.log('info', 'deep', { a: { b: { c: { d: { e: 1 } } } } });
  const [e1, e2] = entries();
  assert.ok(e1.ctx.s.length <= 201);
  assert.equal(e2.ctx.a.b.c, '[…]', 'عمق سوم به بعد بریده می‌شود');
});

test('بدون context ⇒ ctx ثبت نمی‌شود', () => {
  KarLogger.log('info', 'بدون متن');
  assert.equal(entries()[0].ctx, undefined);
});

test('init لاگ ذخیره‌شدهٔ قبلی را برمی‌گرداند (پایدار در IDB)', async () => {
  KarLogger.log('info', 'پایدار');
  await new Promise(r => setTimeout(r, 30)); // صبر برای flush کوتاه‌شده در تست؟ flush تایمر 1500ms دارد
  // تایمر واقعی بلند است؛ مستقیم از putMeta همان بافر می‌نویسیم:
  await KarIDB.putMeta('_logs', { at: new Date().toISOString(), entries: [{ at: 't', level: 'warn', message: 'قبلی' }] });
  await KarLogger.init();
  const e = entries();
  assert.ok(e.some(x => x.message === 'قبلی'), 'لاگ قبلی از IDB برگشت');
});
