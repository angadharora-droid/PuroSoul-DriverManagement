import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDb } from './config/db.js';
import authRoutes from './routes/auth.js';
import partyRoutes from './routes/parties.js';
import driverRoutes from './routes/drivers.js';
import adminRoutes from './routes/admins.js';
import collectionRoutes from './routes/collections.js';
import handoverRoutes from './routes/handovers.js';
import reportRoutes from './routes/reports.js';
import settingsRoutes from './routes/settings.js';
import { errorHandler, notFound } from './middleware/error.js';
import { scheduleDayEndReport } from './services/dayend.js';

if (!process.env.JWT_SECRET) {
  console.warn('[warn] JWT_SECRET is not set — using an insecure development default. Set it in .env before going live.');
}

const app = express();
app.set('trust proxy', 1);

app.use(cors({ origin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',') }));
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'purosoul-cash', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/parties', partyRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/handovers', handoverRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);

app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT) || 5000;

connectDb()
  .then(() => {
    scheduleDayEndReport();
    app.listen(port, () => console.log(`[server] listening on http://localhost:${port}`));
  })
  .catch((err) => {
    console.error('[fatal] could not connect to MongoDB:', err.message);
    process.exit(1);
  });
