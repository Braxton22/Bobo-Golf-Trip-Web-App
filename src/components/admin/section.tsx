import Link from "next/link";
import { ChevronLeft } from "lucide-react";

type Props = {
  title: string;
  description?: string;
  back?: { href: string; label?: string };
  children: React.ReactNode;
  actions?: React.ReactNode;
};

export function AdminSection({ title, description, back, children, actions }: Props) {
  return (
    <div className="space-y-6">
      {back && (
        <Link
          href={back.href}
          className="-ml-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {back.label ?? "Back"}
        </Link>
      )}
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function FormRow({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

export function SubmitButton({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <button type="submit" className={`btn ${className}`}>
      {children}
    </button>
  );
}
