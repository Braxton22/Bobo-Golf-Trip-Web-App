import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card max-w-md mx-auto text-center">
      <h1 className="text-2xl font-bold text-fairway-700">Out of bounds</h1>
      <p className="mt-2 text-sm text-fairway-900/70">
        That page doesn't exist — or you can't see it.
      </p>
      <Link href="/" className="btn mt-4 inline-flex">Head home</Link>
    </div>
  );
}
