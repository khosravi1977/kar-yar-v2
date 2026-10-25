/* kar-yar v4 — quota service: پیام قابل فهم برای خطای فضای ذخیره‌سازی؛ بدون حذف خودکار داده */
window.KarQuota = (function () {
  const MESSAGE = 'فضای ذخیره‌سازی پر شده است. لطفاً «خروجی پشتیبان» را بگیرید و داده‌های قدیمی را حذف کنید.';
  let ui = {};

  function attach(opts) { ui = opts || {}; }

  function show(err) {
    const isQuota = err && (err.isQuota || err.name === 'QuotaExceededError');
    const text = isQuota ? MESSAGE : ('ذخیره‌سازی انجام نشد (' + ((err && err.name) || 'خطا') + '). تغییرات اخیر ذخیره نشده‌اند؛ لطفاً «خروجی پشتیبان» را بگیرید.');
    if (ui.showNotice) ui.showNotice(text);
    if (ui.banner) ui.banner.hidden = false;
    KarLogger.log('error', 'storage_show_error', { quota: !!isQuota, name: err && err.name });
  }

  function clear() { if (ui.banner) ui.banner.hidden = true; }

  return { attach: attach, show: show, clear: clear, MESSAGE: MESSAGE };
})();
