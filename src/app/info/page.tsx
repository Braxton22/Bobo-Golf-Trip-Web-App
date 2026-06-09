import Link from "next/link";
import { redirect } from "next/navigation";
import {
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
import type { Course, Hole, HoleYardage, Lodging, Tee } from "@/lib/db";
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

  // Course + lodging + tees + holes + yardages.
  const { data: courseRow } = await supabase
    .from("courses")
    .select("*")
    .eq("trip_id", trip.id)
    .maybeSingle();
  const course = courseRow as Course | null;

  let holes: Hole[] = [];
  let tees: Tee[] = [];
  let yardages: HoleYardage[] = [];
  if (course) {
    const [{ data: h }, { data: t }] = await Promise.all([
      supabase.from("holes").select("*").eq("course_id", course.id).order("hole_number"),
      supabase.from("tees").select("*").eq("course_id", course.id).order("created_at"),
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

  const { data: lodgingRow } = await supabase
    .from("lodging")
    .select("*")
    .eq("trip_id", trip.id)
    .maybeSingle();
  const lodging = lodgingRow as Lodging | null;

  let forecast: DayForecast[] = [];
  if (course?.latitude != null && course?.longitude != null) {
    try {
      forecast = await fetchForecast({
        latitude: Number(course.latitude),
        longitude: Number(course.longitude),
        days: 3,
      });
    } catch {
      // Open-Meteo is best-effort; if it fails (offline / outage) we just hide it.
      forecast = [];
    }
  }

  const yardByHoleByTee = new Map<string, Map<string, number>>();
  for (const t of tees) yardByHoleByTee.set(t.id, new Map());
  for (const y of yardages) yardByHoleByTee.get(y.tee_id)?.set(y.hole_id, y.yards);

  const totalPar = holes.reduce((a, h) => a + h.par, 0);

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
          <ul className="grid grid-cols-3 gap-2">
            {forecast.map((d) => (
              <li key={d.date} className="rounded-xl border border-line bg-background/40 p-3 text-center">
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

      {/* Course --------------------------------------------------------- */}
      {course ? (
        <section className="card space-y-3">
          <header className="flex items-baseline justify-between">
            <h2 className="font-medium">
              {course.name}
              <span className="ml-2 text-xs text-muted-foreground">par {totalPar}</span>
            </h2>
            {course.latitude != null && course.longitude != null && (
              <a
                href={`https://maps.google.com/?q=${course.latitude},${course.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <MapPin className="h-3.5 w-3.5" />
                Map
              </a>
            )}
          </header>

          {holes.length > 0 && (
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="text-left py-1.5 pr-2">Hole</th>
                    <th className="text-left py-1.5 pr-2">Par</th>
                    <th className="text-left py-1.5 pr-2">SI</th>
                    {tees.map((t) => (
                      <th key={t.id} className="text-right py-1.5 pl-2 tabular-nums">
                        {t.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holes.map((h) => (
                    <tr key={h.id} className="border-t border-line">
                      <td className="py-1.5 pr-2 font-medium tabular-nums">{h.hole_number}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{h.par}</td>
                      <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">{h.stroke_index}</td>
                      {tees.map((t) => (
                        <td key={t.id} className="py-1.5 pl-2 text-right tabular-nums">
                          {yardByHoleByTee.get(t.id)?.get(h.id) ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <p className="card text-sm text-muted-foreground">No course set up yet.</p>
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
            <p className="rounded-xl bg-background/40 p-3 text-sm whitespace-pre-wrap">{lodging.notes}</p>
          )}
        </section>
      )}

      {/* Photos link --------------------------------------------------- */}
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
