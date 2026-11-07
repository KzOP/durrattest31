/** Accounts with full control over every listing and employee. Keep in sync with firestore.rules. */
export const ADMIN_EMAILS = ['emp0@abcd0650'];

export function isAdminEmail(email: string | null | undefined) {
  return Boolean(email) && ADMIN_EMAILS.includes(String(email).trim().toLowerCase());
}
