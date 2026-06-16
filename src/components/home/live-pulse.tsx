// Tiny CSS-only "live" indicator. Pure presentation, no state — when this is
// mounted alongside <RealtimeRefresh/> the page IS live, so the dot is too.
export function LivePulse({ label = "Live" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--primary))]">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--primary))] opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" />
      </span>
      {label}
    </span>
  );
}
