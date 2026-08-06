/**
 * Password policy by account role. Admins may use a 4- or 6-digit PIN or a
 * normal password of 8+ characters; every other role needs 8+ characters.
 * Returns an error message, or null when the password is acceptable.
 */
export function passwordPolicyError(password, role) {
  const pwd = String(password);
  if (role === 'admin' && (/^\d{4}$/.test(pwd) || /^\d{6}$/.test(pwd))) return null;
  if (pwd.length >= 8) return null;
  return role === 'admin'
    ? 'Password must be a 4- or 6-digit PIN, or at least 8 characters'
    : 'Password must be at least 8 characters';
}
