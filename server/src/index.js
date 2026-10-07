import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDb } from './config/db.js';
import authRoutes from './routes/auth.js';
import ssoRoutes from './routes/sso.js';
import partyRoutes from './routes/parties.js';
import collectorRoutes from './routes/collectors.js';
import receiverRoutes from './routes/receivers.js';
import adminRoutes from './routes/admins.js';
import collectionRoutes from './routes/collections.js';
import handoverRoutes from './routes/handovers.js';
import reportRoutes from './routes/reports.js';
import settingsRoutes from './routes/settings.js';
import eventRoutes from './routes/events.js';
import { errorHandler, notFound } from './middleware/error.js';
import { scheduleDayEndReport } from './services/dayend.js';

if (!process.env.JWT_SECRET) {
  console.warn('[warn] JWT_SECRET is not set — using an insecure development default. Set it in .env before going live.');
}

const app = express();
app.set('trust proxy', 1);

app.use(cors({ origin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',') }));

// Event bills carry the UPI payment screenshot inline, so that one route gets
// a larger body allowance; every other route keeps the tight default.
const EVENT_BILL_PATH = /^\/api\/events\/[^/]+\/bills\/?$/;
const jsonDefault = express.json({ limit: '256kb' });
const jsonEventBill = express.json({ limit: '8mb' });
app.use((req, res, next) => (EVENT_BILL_PATH.test(req.path) ? jsonEventBill : jsonDefault)(req, res, next));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'purosoul-cash', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/sso', ssoRoutes); // central sign-on directory (shared-secret guarded)
app.use('/api/parties', partyRoutes);
app.use('/api/collectors', collectorRoutes);
app.use('/api/receivers', receiverRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/handovers', handoverRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/events', eventRoutes);

app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT) || 5000;

connectDb()
  .then(() => {
    scheduleDayEndReport().catch((err) => console.error('[day-end] scheduling failed:', err.message));
    app.listen(port, () => console.log(`[server] listening on http://localhost:${port}`));
  })
  .catch((err) => {
    console.error('[fatal] could not connect to MongoDB:', err.message);
    process.exit(1);
  });
