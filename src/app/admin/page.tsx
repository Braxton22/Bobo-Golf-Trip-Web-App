import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Flag, Users, Map, Home as HomeIcon, Calendar, ListChecks, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip, isTripAdmin } from "@/lib/trip-context";
import { AdminSection } from "@/components/admin/section";

type Card = { href: string; label: string; blurb: string; Icon: typeof Flag; disabled?: boolean };

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const trip = await getActiveTrip();
  const adminOfActive = trip ? await isTripAdmin(trip.id) : false;
  const isRyder = trip?.trip_type === "ryder_cup";

  const cards: Card[] = [
    { href: "/admin/trips", label: "Trips", blurb: "Create, switch, archive.", Icon: Trophy },
    ...(isRyder
      ? [{ href: "/admin/teams", label: "Teams", blurb: "Two teams of six.", Icon: Users, disabled: !trip || !adminOfActive } satisfies Card]
      : []),
    { href: "/admin/players", label: "Players", blurb: "Roster, handicaps, Venmo.", Icon: ListChecks, disabled: !trip || !adminOfActive },
    { href: "/admin/course", label: "Courses", blurb: "Per-day courses, holes, tees, yardages.", Icon: Map, disabled: !trip || !adminOfActive },
    { href: "/admin/lodging", label: "Lodging", blurb: "Address, code, WiFi.", Icon: HomeIcon, disabled: !trip || !adminOfActive },
    {
      href: "/admin/rounds",
      label: isRyder ? "Rounds & matches" : "Rounds & formats",
      blurb: isRyder ? "Day formats and pairings." : "Days, formats, groups, tee times.",
      Icon: Calendar,
      disabled: !trip || !adminOfActive,
    },
  ];

  return (
    <AdminSection
      title="Admin"
      description={
        trip
          ? `Active trip: ${trip.name} (${trip.year})  •  Join code ${trip.join_code}`
          : "Create or pick a trip to start configuring it."
      }
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ href, label, blurb, Icon, disabled }) => (
          <li key={href}>
            {disabled ? (
              <div className="card flex items-center gap-3 opacity-50">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{label}</div>
                  <div className="text-xs text-muted-foreground">{blurb}</div>
                </div>
              </div>
            ) : (
              <Link href={href} className="card flex items-center gap-3 transition hover:shadow-lift">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{label}</div>
                  <div className="text-xs text-muted-foreground">{blurb}</div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </AdminSection>
  );
}
