#!/usr/bin/env node
/* lh-assert: بهترینِ دو اجرای Lighthouse باید ≥90 در Performance و Accessibility باشد (MASTER §11.4) */
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (files.length < 1) { console.error('usage: lh-assert <lighthouse.json> [more.json]'); process.exit(2); }
const runs = files.map(f => {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  return {
    performance: Math.round((j.categories.performance.score || 0) * 100),
    accessibility: Math.round((j.categories.accessibility.score || 0) * 100)
  };
});
const best = {
  performance: Math.max(...runs.map(r => r.performance)),
  accessibility: Math.max(...runs.map(r => r.accessibility))
};
console.log('LIGHTHOUSE SCORES:', JSON.stringify({ runs, best }));
if (best.performance < 90 || best.accessibility < 90) {
  console.error(`UNDER TARGET (هدف ≥90): performance=${best.performance} accessibility=${best.accessibility}`);
  process.exit(1);
}
console.log('LIGHTHOUSE: GREEN (≥90)');
