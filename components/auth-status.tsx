import Link from "next/link";
import { getCurrentUser } from "@/lib/db/server";
import { signOutAction } from "@/lib/auth/actions";

export async function AuthStatus() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Link
        className="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
        href="/login"
      >
        Sign in
      </Link>
    );
  }

  return (
    <form action={signOutAction} className="flex items-center gap-3">
      <span className="max-w-[220px] truncate text-xs font-medium text-slate-600">{user.email}</span>
      <button className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50">
        Sign out
      </button>
    </form>
  );
}
