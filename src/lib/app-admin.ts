// App-level admin allowlist. Trip-scoped admin (is_trip_admin) governs what
// you can do INSIDE a trip; this governs who can use the /admin section and
// create trips at all.
//
// Configure via ADMIN_EMAILS (comma-separated, server-only env var); falls
// back to the hardcoded owner so a missing env var can't lock the owner out
// or open the gates.

const DEFAULT_ADMIN_EMAILS = ["braxton.bobo@gmail.com"];

export function isAppAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const fromEnv = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const allowlist = fromEnv.length > 0 ? fromEnv : DEFAULT_ADMIN_EMAILS;
  return allowlist.includes(email.toLowerCase());
}
