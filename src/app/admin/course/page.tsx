import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, MapPin, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip, isTripAdmin } from "@/lib/trip-context";
import { AdminSection, Field, FormRow, SubmitButton } from "@/components/admin/section";
import { NoTrip } from "@/components/admin/no-trip";
import type { Course as DBCourse, Hole, Round } from "@/lib/db";
import { createCourseAction } from "./actions";

export default async function CourseListPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/course");

  const trip = await getActiveTrip();
  if (!trip) return <NoTrip />;
  if (!(await isTripAdmin(trip.id))) redirect("/admin");

  const [{ data: coursesRaw }, { data: roundsRaw }] = await Promise.all([
    supabase.from("courses").select("*").eq("trip_id", trip.id).order("created_at"),
    supabase.from("rounds").select("*").eq("trip_id", trip.id).order("day_number"),
  ]);
  const courses = (coursesRaw ?? []) as DBCourse[];
  const rounds = (roundsRaw ?? []) as Round[];

  // Par per course + which days play it.
  let holes: Hole[] = [];
  if (courses.length > 0) {
    const { data } = await supabase
      .from("holes")
      .select("course_id, par")
      .in("course_id", courses.map((c) => c.id));
    holes = (data ?? []) as Hole[];
  }
  const parByCourse = new Map<string, number>();
  for (const h of holes) parByCourse.set(h.course_id, (parByCourse.get(h.course_id) ?? 0) + h.par);
  const daysByCourse = new Map<string, number[]>();
  for (const r of rounds) {
    if (!r.course_id) continue;
    (daysByCourse.get(r.course_id) ?? daysByCourse.set(r.course_id, []).get(r.course_id)!).push(r.day_number);
  }

  return (
    <AdminSection
      title="Courses"
      description="Add every course you'll play, then assign one to each day under Rounds."
      back={{ href: "/admin" }}
    >
      <section className="space-y-2">
        {courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No courses yet — add your first below.</p>
        ) : (
          <ul className="space-y-2">
            {courses.map((c) => {
              const days = (daysByCourse.get(c.id) ?? []).sort((a, b) => a - b);
              return (
                <li key={c.id}>
                  <Link
                    href={`/admin/course/${c.id}`}
                    className="card flex items-center gap-3 transition hover:shadow-lift"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        par {parByCourse.get(c.id) ?? "—"}
                        {days.length > 0 ? ` · Day ${days.join(", ")}` : " · not assigned to a day yet"}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card space-y-3">
        <header className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          <h2 className="font-medium">Add a course</h2>
        </header>
        <form action={createCourseAction} className="space-y-3">
          <Field label="Course name">
            <input className="input" name="name" required placeholder="Ross Bridge" />
          </Field>
          <FormRow>
            <Field label="Latitude" hint="Used for the weather forecast.">
              <input className="input" name="latitude" type="number" step="0.000001" placeholder="33.398500" />
            </Field>
            <Field label="Longitude" hint="West is negative, e.g. -86.8837.">
              <input className="input" name="longitude" type="number" step="0.000001" placeholder="-86.883700" />
            </Field>
          </FormRow>
          <SubmitButton>Add course</SubmitButton>
        </form>
      </section>
    </AdminSection>
  );
}
