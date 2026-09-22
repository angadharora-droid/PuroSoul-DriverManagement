import { Router } from 'express';
import Admin from '../models/Admin.js';
import Collector from '../models/Collector.js';
import Receiver from '../models/Receiver.js';
import { directoryGuard } from '../lib/ssoClient.js';

const router = Router();

// GET /api/sso/users — account directory for the central sign-on admin screen,
// so accounts can be matched to portal logins without pasting a CSV. Ids carry
// the role prefix POST /api/auth/sso expects ("admin:<id>", "collector:<id>",
// "receiver:<id>"). Collectors and receivers have no email, so their mobile
// number is the label. Read-only and reachable only with the shared secret;
// the projections never include passwordHash.
router.get('/users', directoryGuard, async (_req, res) => {
  const [admins, collectors, receivers] = await Promise.all([
    Admin.find({ isActive: true }, 'name email').sort({ name: 1 }).lean(),
    Collector.find({ isActive: true }, 'name mobile').sort({ name: 1 }).lean(),
    // Only receivers an admin has granted a login (canCollect) can sign in.
    Receiver.find({ isActive: true, passwordHash: { $nin: [null, ''] } }, 'name mobile').sort({ name: 1 }).lean(),
  ]);
  res.json([
    ...admins.map((a) => ({ id: `admin:${a._id}`, name: a.name, email: a.email, role: 'admin' })),
    ...collectors.map((c) => ({ id: `collector:${c._id}`, name: c.name, email: c.mobile, role: 'collector' })),
    ...receivers.map((r) => ({ id: `receiver:${r._id}`, name: r.name, email: r.mobile, role: 'receiver' })),
  ]);
});

export default router;
