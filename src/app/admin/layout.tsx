import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAppAdminEmail } from "@/lib/app-admin";

// Gates the entire /admin segment. Non-admins are bounced to the leaderboard;
// signed-out users go to login. Individual pages still run their own
// trip-scoped checks on top of this.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAppAdminEmail(user.email)) redirect("/leaderboard");

  return <>{children}</>;
}
