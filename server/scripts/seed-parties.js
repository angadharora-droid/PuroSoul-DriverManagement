/**
 * Imports the distributor/party list into the Party collection.
 *   node scripts/seed-parties.js --dry-run   # report only, writes nothing
 *   node scripts/seed-parties.js
 *
 * Source: scripts/data/parties.json, extracted from the debtors contact list.
 * The first number in each entry is the default the OTP goes to; the rest are
 * offered to the collector as alternatives.
 *
 * Safe to re-run. Existing parties are never overwritten or deactivated: only
 * numbers missing from their record are added, and a default already in use is
 * left alone (a collector or admin may have chosen it deliberately).
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { connectDb } from '../src/config/db.js';
import Party from '../src/models/Party.js';

const dryRun = process.argv.includes('--dry-run');

const raw = await readFile(new URL('./data/parties.json', import.meta.url), 'utf8');
const entries = JSON.parse(raw);

const bad = entries.filter((e) => !e.name || !e.mobiles?.length || !e.mobiles.every((m) => /^\d{10}$/.test(m)));
if (bad.length) {
  console.error(`[seed-parties] ${bad.length} malformed entries — aborting:`);
  bad.slice(0, 10).forEach((e) => console.error('   ', JSON.stringify(e)));
  process.exit(1);
}

await connectDb();
if (dryRun) console.log('[seed-parties] DRY RUN — no changes will be written\n');

const created = [];
const updated = [];
const unchanged = [];

for (const entry of entries) {
  const name = entry.name.trim();
  // Case-insensitive match so a re-run can't create a near-duplicate of a
  // party an admin already added by hand.
  const existing = await Party.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });

  if (!existing) {
    const [mobile, ...altMobiles] = entry.mobiles;
    if (!dryRun) {
      await Party.create({ name, mobile, altMobiles, notifyEmails: entry.notifyEmails || [] });
    }
    created.push(`${name} → ${mobile}${altMobiles.length ? ` (+${altMobiles.length})` : ''}`);
    continue;
  }

  const known = new Set([existing.mobile, ...(existing.altMobiles || [])]);
  const missing = entry.mobiles.filter((m) => !known.has(m));
  const newEmails = (entry.notifyEmails || []).filter((e) => !(existing.notifyEmails || []).includes(e));

  if (!missing.length && !newEmails.length) {
    unchanged.push(name);
    continue;
  }

  existing.altMobiles = [...(existing.altMobiles || []), ...missing];
  if (newEmails.length) existing.notifyEmails = [...(existing.notifyEmails || []), ...newEmails];
  if (!dryRun) await existing.save();
  updated.push(`${name} — added ${[...missing, ...newEmails].join(', ')} (default stays ${existing.mobile})`);
}

const list = (label, rows) => {
  if (!rows.length) return;
  console.log(`\n${label} (${rows.length})`);
  rows.forEach((r) => console.log('   ', r));
};

list(dryRun ? 'WOULD CREATE' : 'CREATED', created);
list(dryRun ? 'WOULD UPDATE' : 'UPDATED', updated);
console.log(`\nalready up to date: ${unchanged.length}`);
console.log(`total in source: ${entries.length}   with a choice of numbers: ${entries.filter((e) => e.mobiles.length > 1).length}`);

await mongoose.disconnect();
console.log(dryRun ? '\n[seed-parties] dry run complete — nothing written' : '\n[seed-parties] done');
