/**
 * Seeds the admin account (always) and optional demo data (--demo flag).
 *   node scripts/seed.js          → admin only
 *   node scripts/seed.js --demo   → admin + sample parties & drivers
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../src/config/db.js';
import Admin from '../src/models/Admin.js';
import Driver from '../src/models/Driver.js';
import Party from '../src/models/Party.js';

await connectDb();

const email = (process.env.SEED_ADMIN_EMAIL || 'admin@purosoul.local').toLowerCase();
let admin = await Admin.findOne({ email });
if (!admin) {
  admin = new Admin({ name: process.env.SEED_ADMIN_NAME || 'Administrator', email });
  await admin.setPassword(process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!');
  await admin.save();
  console.log(`[seed] admin created: ${email} (password from SEED_ADMIN_PASSWORD)`);
} else {
  console.log(`[seed] admin already exists: ${email}`);
}

if (process.argv.includes('--demo')) {
  const parties = [
    { name: 'Sharma Distributors', mobile: '9876543210', notifyEmails: ['accounts@purosoul.local'], distributorCode: 'DL-001' },
    { name: 'Gupta Trading Co', mobile: '9876543211', notifyEmails: [], distributorCode: 'DL-002' },
    { name: 'Verma & Sons', mobile: '9876543212', notifyEmails: [], distributorCode: 'UP-014' },
  ];
  for (const p of parties) {
    await Party.updateOne({ name: p.name }, { $setOnInsert: p }, { upsert: true });
  }
  console.log('[seed] demo parties upserted');

  if (!(await Driver.findOne({ mobile: '9999999999' }))) {
    const d = new Driver({ name: 'Demo Driver', mobile: '9999999999' });
    await d.setPassword('driver123');
    await d.save();
    console.log('[seed] demo driver created: 9999999999 / driver123');
  }
}

await mongoose.disconnect();
console.log('[seed] done');
