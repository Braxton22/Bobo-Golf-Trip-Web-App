import { Sparkles } from "lucide-react";

type Props = { title: string; phase: string; blurb?: string };

export function ComingSoon({ title, phase, blurb }: Props) {
  return (
    <div className="card text-center space-y-3">
      <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="h-5 w-5" />
      </div>
      <h1 className="font-serif text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Coming online in <span className="font-medium text-foreground">{phase}</span>.
      </p>
      {blurb && <p className="text-sm text-muted-foreground">{blurb}</p>}
    </div>
  );
}
