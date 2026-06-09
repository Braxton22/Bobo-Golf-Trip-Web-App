import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip, isTripAdmin } from "@/lib/trip-context";
import { AdminSection, Field, FormRow, SubmitButton } from "@/components/admin/section";
import { NoTrip } from "@/components/admin/no-trip";
import type { Course as DBCourse, Hole, HoleYardage, Tee } from "@/lib/db";
import {
  addTeeAction,
  deleteTeeAction,
  saveHolesAction,
  saveYardagesAction,
  upsertCourseAction,
} from "./actions";

export default async function CourseAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/course");

  const trip = await getActiveTrip();
  if (!trip) return <NoTrip />;
  if (!(await isTripAdmin(trip.id))) redirect("/admin");

  const { data: courseRaw } = await supabase
    .from("courses")
    .select("*")
    .eq("trip_id", trip.id)
    .maybeSingle();
  const course = courseRaw as DBCourse | null;

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
    if (tees.length > 0 && holes.length > 0) {
      const { data: y } = await supabase
        .from("hole_yardages")
        .select("hole_id, tee_id, yards")
        .in("hole_id", holes.map((x) => x.id));
      yardages = (y ?? []) as HoleYardage[];
    }
  }

  const totalPar = holes.reduce((acc, h) => acc + h.par, 0);

  return (
    <AdminSection
      title="Course"
      description="Course basics, 18 holes (par & stroke index), tees & yardages."
      back={{ href: "/admin" }}
    >
      {/* Course info ----------------------------------------------------- */}
      <section className="card space-y-3">
        <h2 className="font-medium">Course info</h2>
        <form action={upsertCourseAction} className="space-y-3">
          <Field label="Course name">
            <input
              className="input"
              name="name"
              required
              defaultValue={course?.name ?? "Course"}
            />
          </Field>
          <FormRow>
            <Field label="Latitude" hint="Used for weather forecasts.">
              <input
                className="input"
                name="latitude"
                type="number"
                step="0.000001"
                defaultValue={course?.latitude ?? ""}
              />
            </Field>
            <Field label="Longitude">
              <input
                className="input"
                name="longitude"
                type="number"
                step="0.000001"
                defaultValue={course?.longitude ?? ""}
              />
            </Field>
          </FormRow>
          <SubmitButton>{course ? "Save course" : "Create course"}</SubmitButton>
        </form>
      </section>

      {!course ? (
        <p className="text-sm text-muted-foreground">
          Save the course to enable holes, tees, and yardages.
        </p>
      ) : (
        <>
          {/* Tees ---------------------------------------------------------- */}
          <section className="card space-y-3">
            <h2 className="font-medium">Tees</h2>
            <ul className="space-y-2">
              {tees.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-background/40 p-3"
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground">
                    rating {t.course_rating ?? "—"} · slope {t.slope ?? "—"} · par {t.par ?? "—"}
                  </span>
                  <form action={deleteTeeAction} className="ml-auto">
                    <input type="hidden" name="id" value={t.id} />
                    <button
                      type="submit"
                      className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </form>
                </li>
              ))}
              {tees.length === 0 && (
                <li className="text-sm text-muted-foreground">No tees yet.</li>
              )}
            </ul>
            <form action={addTeeAction} className="space-y-3 border-t border-line pt-3">
              <FormRow>
                <Field label="Name">
                  <input className="input" name="name" required placeholder="Blue" />
                </Field>
                <Field label="Par">
                  <input className="input" name="par" type="number" defaultValue={72} />
                </Field>
              </FormRow>
              <FormRow>
                <Field label="Course rating">
                  <input className="input" name="course_rating" type="number" step="0.1" />
                </Field>
                <Field label="Slope">
                  <input className="input" name="slope" type="number" />
                </Field>
              </FormRow>
              <SubmitButton className="btn-ghost">Add tee</SubmitButton>
            </form>
          </section>

          {/* 18 holes ----------------------------------------------------- */}
          <section className="card space-y-3">
            <header className="flex items-center justify-between">
              <h2 className="font-medium">Holes (par {totalPar})</h2>
              <span className="text-xs text-muted-foreground">Par 3–6 · Stroke index 1–18</span>
            </header>
            <form action={saveHolesAction} className="space-y-3">
              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="text-left py-1.5 pr-2">Hole</th>
                      <th className="text-left py-1.5 pr-2">Par</th>
                      <th className="text-left py-1.5">SI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holes.map((h) => (
                      <tr key={h.id} className="border-t border-line">
                        <td className="py-2 pr-2 font-medium tabular-nums">{h.hole_number}</td>
                        <td className="py-2 pr-2">
                          <input
                            className="input h-10 w-16 px-2 text-base tabular-nums"
                            type="number"
                            min={3}
                            max={6}
                            name={`par_${h.hole_number}`}
                            defaultValue={h.par}
                            inputMode="numeric"
                          />
                        </td>
                        <td className="py-2">
                          <input
                            className="input h-10 w-16 px-2 text-base tabular-nums"
                            type="number"
                            min={1}
                            max={18}
                            name={`si_${h.hole_number}`}
                            defaultValue={h.stroke_index}
                            inputMode="numeric"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <SubmitButton>Save holes</SubmitButton>
            </form>
          </section>

          {/* Yardages ---------------------------------------------------- */}
          {tees.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-medium">Yardages</h2>
              {tees.map((tee) => {
                const teeYards = new Map(
                  yardages.filter((y) => y.tee_id === tee.id).map((y) => [y.hole_id, y.yards])
                );
                return (
                  <article key={tee.id} className="card space-y-3">
                    <header className="font-medium">{tee.name} tees</header>
                    <form action={saveYardagesAction} className="space-y-3">
                      <input type="hidden" name="tee_id" value={tee.id} />
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {holes.map((h) => (
                          <label key={h.id} className="space-y-1">
                            <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                              #{h.hole_number}
                            </span>
                            <input
                              className="input h-10 px-2 text-base tabular-nums"
                              type="number"
                              min={50}
                              max={800}
                              name={`yards_${h.hole_number}`}
                              defaultValue={teeYards.get(h.id) ?? ""}
                              inputMode="numeric"
                            />
                          </label>
                        ))}
                      </div>
                      <SubmitButton className="btn-ghost">Save {tee.name} yardages</SubmitButton>
                    </form>
                  </article>
                );
              })}
            </section>
          )}
        </>
      )}
    </AdminSection>
  );
}
