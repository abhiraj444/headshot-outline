"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun, Settings2, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AppHeader() {
  const path = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";
  const nav = [
    { href: "/", label: "Studio", icon: ScanFace },
    { href: "/settings", label: "Settings", icon: Settings2 },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:px-6">
        <Link href="/" className="mr-auto flex min-h-11 items-center gap-2 rounded-md font-semibold tracking-tight">
          <svg aria-hidden viewBox="0 0 32 32" className="size-7 text-primary">
            <path d="M16 3c-6 0-10 4.6-10 10.5 0 3.7 1.7 6.6 3.6 8.6.9 1 1.4 2.3 1.4 3.6V28h10v-2.3c0-1.3.5-2.6 1.4-3.6 1.9-2 3.6-4.9 3.6-8.6C26 7.6 22 3 16 3Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M12 14.5h2.5M17.5 14.5H20M14.5 20.5c1 .7 2 .7 3 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span>Headshot Outline</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-muted",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="hidden sm:inline">{label}</span>
                <span className="sr-only sm:hidden">{label}</span>
              </Link>
            );
          })}
          <Button
            variant="ghost"
            size="icon"
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            onClick={() => setTheme(isDark ? "light" : "dark")}
          >
            {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>
        </nav>
      </div>
    </header>
  );
}
