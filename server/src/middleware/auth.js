import jwt from 'jsonwebtoken';
import Driver from '../models/Driver.js';
import Admin from '../models/Admin.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret';

export function signToken(account, role) {
  return jwt.sign({ sub: account._id.toString(), role, name: account.name }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  });
}

/**
 * requireAuth('driver') / requireAuth('admin') / requireAuth('driver', 'admin')
 * Verifies the JWT and re-checks the account is still active on every request,
 * so deactivating a driver locks them out immediately.
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

      const Model = payload.role === 'driver' ? Driver : Admin;
      const account = await Model.findById(payload.sub);
      if (!account || account.isActive === false) {
        return res.status(401).json({ error: 'This account has been disabled' });
      }

      req.user = { id: account._id.toString(), role: payload.role, name: account.name };
      next();
    } catch (err) {
      next(err);
    }
  };
}
