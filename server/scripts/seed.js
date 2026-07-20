/**
 * Seeds the initial admin account (skipped if it already exists).
 *   node scripts/seed.js
 * Uses SEED_ADMIN_NAME / SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD from .env.
 * Everything else — more admins, collectors, parties — is created from the admin panel.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../src/config/db.js';
import Admin from '../src/models/Admin.js';

await connectDb();

const email = (process.env.SEED_ADMIN_EMAIL || 'admin@purosoul.local').toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
if (password === 'ChangeMe123!') {
  console.warn('[seed] WARNING: using the default admin password — set SEED_ADMIN_PASSWORD in .env and change it after first login');
}

let admin = await Admin.findOne({ email });
if (!admin) {
  admin = new Admin({ name: process.env.SEED_ADMIN_NAME || 'Administrator', email });
  await admin.setPassword(password);
  await admin.save();
  console.log(`[seed] admin created: ${email}`);
} else {
  console.log(`[seed] admin already exists: ${email}`);
}

await mongoose.disconnect();
console.log('[seed] done');
