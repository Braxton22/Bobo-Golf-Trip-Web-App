import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewTripCard({ action }: { action: (formData: FormData) => void }) {
  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <PlusCircle className="h-5 w-5 text-primary" aria-hidden />
          Plan a new trip
        </CardTitle>
        <CardDescription>
          Set the destination and dates — you can refine everything later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="trip-name">Trip name</Label>
            <Input id="trip-name" name="name" required placeholder="Bobo Trip 2026" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="trip-location">Location</Label>
            <Input id="trip-location" name="location" placeholder="Pinehurst, NC" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="trip-starts">Starts</Label>
            <Input id="trip-starts" name="starts_on" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="trip-ends">Ends</Label>
            <Input id="trip-ends" name="ends_on" type="date" />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" size="lg" className="w-full sm:w-auto">
              Create trip
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
