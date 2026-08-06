// Mirrors the server password policy (server/src/utils/password.js): admins
// may use a 4- or 6-digit PIN or a normal password of 8+ characters; every
// other role needs 8+ characters.
export const ADMIN_PASSWORD_HINT = '8+ characters, or a 4- or 6-digit PIN';
export const PASSWORD_HINT = 'At least 8 characters';

export function passwordPolicyError(password, isAdmin) {
  if (isAdmin && (/^\d{4}$/.test(password) || /^\d{6}$/.test(password))) return null;
  if (password.length >= 8) return null;
  return isAdmin
    ? 'Password must be a 4- or 6-digit PIN, or at least 8 characters'
    : 'Password must be at least 8 characters';
}
