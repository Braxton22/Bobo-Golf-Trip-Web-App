import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  Camera,
  Cloud,
  CloudRain,
  Droplets,
  Home as HomeIcon,
  Lock,
  MapPin,
  Sun,
  Wifi,
  Wind,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";
import type { Course, Hole, HoleYardage, Lodging, Round, Tee } from "@/lib/db";
import { FORMAT_LABEL } from "@/lib/trip-formats";
import { fetchForecast, type DayForecast } from "@/lib/weather";

export default async function InfoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/info");

  const trip = await getActiveTrip();
  if (!trip) {
    return (
      <div className="card text-center space-y-2">
        <h1 className="font-serif text-xl font-semibold">No active trip</h1>
      </div>
    );
  }

  // Courses (a trip can play several) + their holes/tees/yardages, plus
  // rounds so we can label which day plays each course.
  const [{ data: coursesRaw }, { data: roundsRaw }, { data: lodgingRow }] = await Promise.all([
    supabase.from("courses").select("*").eq("trip_id", trip.id).order("created_at"),
    supabase.from("rounds").select("day_number, format, course_id").eq("trip_id", trip.id).order("day_number"),
    supabase.from("lodging").select("*").eq("trip_id", trip.id).maybeSingle(),
  ]);
  const courses = (coursesRaw ?? []) as Course[];
  const rounds = (roundsRaw ?? []) as Pick<Round, "day_number" | "format" | "course_id">[];
  const lodging = lodgingRow as Lodging | null;

  let holes: Hole[] = [];
  let tees: Tee[] = [];
  let yardages: HoleYardage[] = [];
  if (courses.length > 0) {
    const courseIds = courses.map((c) => c.id);
    const [{ data: h }, { data: t }] = await Promise.all([
      supabase.from("holes").select("*").in("course_id", courseIds).order("hole_number"),
      supabase.from("tees").select("*").in("course_id", courseIds).order("created_at"),
    ]);
    holes = (h ?? []) as Hole[];
    tees = (t ?? []) as Tee[];
    if (holes.length > 0) {
      const { data: y } = await supabase
        .from("hole_yardages")
        .select("hole_id, tee_id, yards")
        .in("hole_id", holes.map((x) => x.id));
      yardages = (y ?? []) as HoleYardage[];
    }
  }

  // Group children by course.
  const holesByCourse = new Map<string, Hole[]>();
  for (const h of holes) (holesByCourse.get(h.course_id) ?? holesByCourse.set(h.course_id, []).get(h.course_id)!).push(h);
  const teesByCourse = new Map<string, Tee[]>();
  for (const t of tees) (teesByCourse.get(t.course_id) ?? teesByCourse.set(t.course_id, []).get(t.course_id)!).push(t);
  const yardByTeeHole = new Map<string, number>(); // `${tee_id}|${hole_id}` → yards
  for (const y of yardages) yardByTeeHole.set(`${y.tee_id}|${y.hole_id}`, y.yards);
  const daysByCourse = new Map<string, number[]>();
  for (const r of rounds) {
    if (!r.course_id) continue;
    (daysByCourse.get(r.course_id) ?? daysByCourse.set(r.course_id, []).get(r.course_id)!).push(r.day_number);
  }

  // Format-explainer subtitle adapts to the trip.
  const isRyder = trip.trip_type === "ryder_cup";
  let formatSubtitle = "Scramble · Best ball + bonus · Singles · Cup points";
  if (!isRyder) {
    const labels = [...new Set(rounds.map((r) => FORMAT_LABEL[r.format]))];
    formatSubtitle = labels.length > 0 ? labels.join(" · ") : "Pick a format per round";
  }

  // Weather: forecast for the first course that has coordinates.
  const weatherCourse = courses.find((c) => c.latitude != null && c.longitude != null) ?? null;
  let forecast: DayForecast[] = [];
  if (weatherCourse?.latitude != null && weatherCourse?.longitude != null) {
    try {
      forecast = await fetchForecast({
        latitude: Number(weatherCourse.latitude),
        longitude: Number(weatherCourse.longitude),
        days: 5,
      });
    } catch {
      forecast = [];
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-3xl font-semibold">Info</h1>
        <p className="text-sm text-muted-foreground">
          {trip.name} · {trip.year}
          {trip.location ? ` · ${trip.location}` : ""}
        </p>
      </header>

      {/* Weather --------------------------------------------------------- */}
      {forecast.length > 0 && (
        <section className="card space-y-3">
          <header className="flex items-center justify-between">
            <h2 className="font-medium">Forecast</h2>
            <span className="text-[11px] text-muted-foreground">Open-Meteo</span>
          </header>
          {/* Horizontal scroll on mobile so 5 days fit; 5-column grid on
              larger screens. */}
          <ul className="no-scrollbar -mx-2 flex gap-2 overflow-x-auto px-2 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">
            {forecast.map((d) => (
              <li
                key={d.date}
                className="shrink-0 basis-[7.5rem] rounded-xl border border-line bg-background/40 p-3 text-center sm:basis-auto"
              >
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {new Date(d.date).toLocaleDateString(undefined, { weekday: "short" })}
                </p>
                <div className="mx-auto mt-1 text-[hsl(var(--gold))]">
                  <WeatherIcon code={d.weatherCode} />
                </div>
                <p className="font-serif text-lg font-semibold tabular-nums">
                  {d.tempMax}°<span className="text-muted-foreground">/{d.tempMin}°</span>
                </p>
                <p className="text-[11px] text-muted-foreground">{d.conditions}</p>
                <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                  <Droplets className="inline h-3 w-3" /> {d.precipPct}% ·{" "}
                  <Wind className="inline h-3 w-3" /> {d.windMax}mph
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Courses -------------------------------------------------------- */}
      {courses.length === 0 ? (
        <p className="card text-sm text-muted-foreground">No course set up yet.</p>
      ) : (
        courses.map((course) => {
          const cHoles = holesByCourse.get(course.id) ?? [];
          const cTees = teesByCourse.get(course.id) ?? [];
          const totalPar = cHoles.reduce((a, h) => a + h.par, 0);
          const days = (daysByCourse.get(course.id) ?? []).sort((a, b) => a - b);
          const par3 = cHoles.filter((h) => h.par === 3).length;
          const par4 = cHoles.filter((h) => h.par === 4).length;
          const par5 = cHoles.filter((h) => h.par >= 5).length;
          // Sum yardages per tee for the high-level row.
          const teeTotals = cTees.map((t) => ({
            id: t.id,
            name: t.name,
            yards: cHoles.reduce((acc, h) => acc + (yardByTeeHole.get(`${t.id}|${h.id}`) ?? 0), 0),
          }));
          return (
            <section key={course.id} className="card space-y-3">
              <header className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-medium truncate">{course.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    par {totalPar || "—"}
                    {days.length > 0 && ` · Day ${days.join(", ")}`}
                    {cHoles.length > 0 && (
                      <>
                        {" · "}
                        {par3} × par 3, {par4} × par 4, {par5} × par 5
                      </>
                    )}
                  </p>
                </div>
                {course.latitude != null && course.longitude != null && (
                  <a
                    href={`https://maps.google.com/?q=${course.latitude},${course.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost inline-flex shrink-0 items-center gap-1.5 text-xs"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    Map
                  </a>
                )}
              </header>

              {teeTotals.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {teeTotals.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-full border border-line bg-background/40 px-2.5 py-1 text-[11px]"
                    >
                      <span className="text-muted-foreground">{t.name}</span>
                      <span className="ml-1.5 font-medium tabular-nums">
                        {t.yards > 0 ? `${t.yards.toLocaleString()} yds` : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}

      {/* Lodging -------------------------------------------------------- */}
      {lodging && (lodging.address || lodging.wifi_ssid || lodging.notes) && (
        <section className="card space-y-3">
          <header className="flex items-center gap-2">
            <HomeIcon className="h-4 w-4 text-primary" />
            <h2 className="font-medium">Where we're staying</h2>
          </header>
          {lodging.address && (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(lodging.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl bg-background/40 p-3 text-sm hover:bg-muted"
            >
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                {lodging.address}
              </span>
            </a>
          )}
          {(lodging.access_code || lodging.wifi_ssid) && (
            <ul className="grid grid-cols-2 gap-2 text-sm">
              {lodging.access_code && (
                <li className="rounded-xl bg-background/40 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    Access
                  </div>
                  <div className="font-mono mt-0.5">{lodging.access_code}</div>
                </li>
              )}
              {lodging.wifi_ssid && (
                <li className="rounded-xl bg-background/40 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    <Wifi className="h-3 w-3" />
                    WiFi
                  </div>
                  <div className="font-mono mt-0.5">{lodging.wifi_ssid}</div>
                  {lodging.wifi_password && (
                    <div className="font-mono text-xs text-muted-foreground">{lodging.wifi_password}</div>
                  )}
                </li>
              )}
            </ul>
          )}
          {lodging.notes && (
            <p className="rounded-xl bg-background/40 p-3 text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {lodging.notes}
            </p>
          )}
        </section>
      )}

      {/* Quick links --------------------------------------------------- */}
      <Link href="/format" className="card flex items-center gap-3 transition hover:shadow-lift">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BookOpen className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="font-medium">How the format works</div>
          <div className="text-xs text-muted-foreground">{formatSubtitle}</div>
        </div>
        <span className="text-xs text-muted-foreground">→</span>
      </Link>

      <Link href="/photos" className="card flex items-center gap-3 transition hover:shadow-lift">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Camera className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="font-medium">Photos</div>
          <div className="text-xs text-muted-foreground">Trip gallery</div>
        </div>
        <span className="text-xs text-muted-foreground">→</span>
      </Link>
    </div>
  );
}

function WeatherIcon({ code }: { code: number }) {
  if (code === 0 || code === 1) return <Sun className="mx-auto h-5 w-5" />;
  if (code >= 95) return <CloudRain className="mx-auto h-5 w-5" />;
  if (code >= 61 && code <= 86) return <CloudRain className="mx-auto h-5 w-5" />;
  return <Cloud className="mx-auto h-5 w-5" />;
}
