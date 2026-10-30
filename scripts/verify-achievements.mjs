import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync(new URL('../server/shared/achievements.json', import.meta.url), 'utf8'));
const entries = data.entries || [];
const ids = new Set();
const titles = new Set();
const stars = {};
const scopes = {};
const rewards = [0, 10, 20, 50, 100, 1000];
let badReward = 0;
for (const e of entries) {
  if (ids.has(e.id)) throw new Error(`duplicate id ${e.id}`);
  if (titles.has(e.title)) throw new Error(`duplicate title ${e.title}`);
  ids.add(e.id); titles.add(e.title);
  if (!Number.isInteger(e.star) || e.star < 1 || e.star > 5) throw new Error(`bad star ${e.id}`);
  if (e.rewardChips !== rewards[e.star]) badReward += 1;
  stars[e.star] = (stars[e.star] || 0) + 1;
  scopes[e.scope] = (scopes[e.scope] || 0) + 1;
}
const report = { total: entries.length, uniqueIds: ids.size, uniqueTitles: titles.size, stars, scopes, badReward, onlineOk: scopes.online >= 500 };
console.log(JSON.stringify(report, null, 2));
if (entries.length < 1000 || ids.size !== entries.length || titles.size !== entries.length || scopes.online < 500 || badReward) process.exit(1);
