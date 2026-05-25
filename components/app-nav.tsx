"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, Database, FileUp, LayoutDashboard, Repeat2 } from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard
  },
  {
    href: "/accounts",
    label: "Accounts",
    icon: Banknote
  },
  {
    href: "/uploads",
    label: "Uploads",
    icon: FileUp
  },
  {
    href: "/transactions",
    label: "Transactions",
    icon: Database
  },
  {
    href: "/imports",
    label: "Imports",
    icon: Repeat2
  }
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link className="text-lg font-semibold text-ink" href="/">
            PersonalFin
          </Link>
          <span className="rounded-md bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
            Ingestion-first MVP
          </span>
        </div>
        <nav aria-label="Primary navigation" className="flex gap-2 overflow-x-auto pb-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={clsx(
                  "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition",
                  isActive
                    ? "bg-ink text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-ink"
                )}
                href={item.href}
                key={item.href}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
