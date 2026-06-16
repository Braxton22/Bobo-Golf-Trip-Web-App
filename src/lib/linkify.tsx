import { Fragment, type ReactNode } from "react";

/**
 * Render a plain string with bare URLs turned into <a> links. Safe for
 * untrusted text: we never inject HTML, just walk the string and emit
 * React nodes for each chunk.
 *
 * Catches things like:
 *   https://example.com/path?x=1#y
 *   www.example.com  (auto-prefixed with https://)
 *
 * Trailing punctuation that wouldn't be part of a URL (.,;:!?) is left
 * outside the link so "see https://x.com." doesn't grab the period.
 */
export function Linkify({ text, className }: { text: string; className?: string }): ReactNode {
  // Match http(s)://… and bare www.<host>…
  const re = /(\bhttps?:\/\/[^\s<>]+|\bwww\.[^\s<>]+)/gi;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    let end = start + m[0].length;
    // Strip trailing punctuation/brackets that are almost never URL-part.
    let raw = m[0];
    while (raw.length > 0 && /[.,;:!?)\]}>]$/.test(raw)) {
      raw = raw.slice(0, -1);
      end -= 1;
    }
    if (start > last) {
      out.push(<Fragment key={`t${key++}`}>{text.slice(last, start)}</Fragment>);
    }
    const href = raw.startsWith("http") ? raw : `https://${raw}`;
    out.push(
      <a
        key={`a${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className ?? "text-primary underline decoration-dotted underline-offset-2 break-all hover:text-foreground"}
      >
        {raw}
      </a>
    );
    last = end;
  }
  if (last < text.length) {
    out.push(<Fragment key={`t${key++}`}>{text.slice(last)}</Fragment>);
  }
  return out;
}
