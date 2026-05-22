import { Flag, Home, DollarSign, type LucideIcon } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const FEATURES: Feature[] = [
  {
    icon: Flag,
    title: "Rounds",
    description: "Log courses, dates, and every player's score with net handicapping.",
  },
  {
    icon: Home,
    title: "Airbnbs",
    description: "Save where you're staying, the costs, and the check-in details.",
  },
  {
    icon: DollarSign,
    title: "Side Bets",
    description: "Propose bets, settle them, and keep score across the whole trip.",
  },
];

export function FeatureCards() {
  return (
    <section className="px-6">
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <Card
            key={title}
            className="p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
          >
            <CardHeader className="gap-3 p-0">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-6 w-6" />
              </span>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}
