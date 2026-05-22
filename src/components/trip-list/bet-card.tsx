import Link from "next/link";
import { Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type BetStatus = "open" | "settled" | "cancelled" | string;

type Bet = {
  id: string;
  description: string | null;
  amount: number | string | null;
  status: BetStatus | null;
  trip_id: string;
  trips?: { name: string | null } | null;
};

const statusVariant: Record<string, "accent" | "secondary" | "outline"> = {
  open: "accent",
  settled: "secondary",
  cancelled: "outline",
};

function formatAmount(amount: number | string | null) {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function BetCard({ bet }: { bet: Bet }) {
  const status = (bet.status ?? "open").toLowerCase();
  const variant = statusVariant[status] ?? "outline";

  return (
    <Link
      href={`/trips/${bet.trip_id}`}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="flex items-center gap-4 p-5 transition-all duration-300 ease-out group-hover:-translate-y-0.5 group-hover:shadow-lift">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
          <Coins className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-card-foreground">
            {bet.description ?? "Side bet"}
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {bet.trips?.name ?? "Trip"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="font-serif text-lg font-semibold tracking-tight text-card-foreground">
            {formatAmount(bet.amount)}
          </span>
          <Badge variant={variant} className="capitalize">
            {status}
          </Badge>
        </div>
      </Card>
    </Link>
  );
}
