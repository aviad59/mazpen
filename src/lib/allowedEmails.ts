/**
 * Allowed user emails. Add new emails here to grant access.
 * Comparison is case-insensitive.
 */
export const ALLOWED_EMAILS: string[] = [
  "idanaviad10@gmail.com",
  "liyamaoz1@gmail.com",
];

export function isEmailAllowed(email: string | undefined): boolean {
  if (!email) return false;
  return ALLOWED_EMAILS.some((e) => e.toLowerCase() === email.toLowerCase());
}
