import jwt from 'jsonwebtoken';
import Collector from '../models/Collector.js';
import Admin from '../models/Admin.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret';

export function signToken(account, role) {
  return jwt.sign({ sub: account._id.toString(), role, name: account.name }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  });
}

/**
 * requireAuth('collector') / requireAuth('admin') / requireAuth('collector', 'admin')
 * Verifies the JWT and re-checks the account is still active on every request,
 * so deactivating a collector locks them out immediately.
 */
export function requireAuth(...roles) {
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (!token) return res.status(401).json({ error: 'Authentication required' });

      let payload;
      try {
        payload = jwt.verify(token, JWT_SECRET);
      } catch {
        return res.status(401).json({ error: 'Session expired — please log in again' });
      }

      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ error: 'You do not have permission to do that' });
      }

      const Model = payload.role === 'collector' ? Collector : Admin;
      const account = await Model.findById(payload.sub);
      if (!account || account.isActive === false) {
        return res.status(401).json({ error: 'This account has been disabled' });
      }

      // designation is carried for collectors so the handover OTP can tell the
      // receiver who is handing the cash over, and in what capacity.
      req.user = {
        id: account._id.toString(),
        role: payload.role,
        name: account.name,
        designation: account.designation || '',
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}
