import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <h2 className="text-2xl font-bold tracking-tight">Page Not Found</h2>
      <p className="mt-2 text-sm text-muted-foreground">The requested page could not be found.</p>
      <Link href="/" className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        Return Home
      </Link>
    </div>
  );
}
