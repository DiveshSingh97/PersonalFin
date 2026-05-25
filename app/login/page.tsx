import { LogIn, UserPlus } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { signInAction, signUpAction } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/db/server";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{
    message?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [{ message }, user] = await Promise.all([searchParams, getCurrentUser()]);

  return (
    <PageShell
      eyebrow="Supabase Auth"
      title="Sign in"
      description="Use Supabase Auth before creating accounts, uploading exports, or reviewing imports."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <form action={signInAction} className="rounded-lg border border-line bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
              <LogIn className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-ink">Existing account</h2>
          </div>
          <AuthFields />
          <button className="mt-5 w-full rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Sign in
          </button>
        </form>

        <form action={signUpAction} className="rounded-lg border border-line bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
              <UserPlus className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-ink">Create account</h2>
          </div>
          <AuthFields />
          <button className="mt-5 w-full rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50">
            Sign up
          </button>
        </form>
      </div>

      {message ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          {message}
        </section>
      ) : null}

      {user ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-900">
          Signed in as {user.email}. You can continue to uploads.
        </section>
      ) : null}
    </PageShell>
  );
}

function AuthFields() {
  return (
    <div className="mt-5 space-y-4">
      <label className="block text-sm font-medium text-slate-700">
        Email
        <input
          autoComplete="email"
          className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm text-ink outline-none focus:border-cyan-600"
          name="email"
          required
          type="email"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Password
        <input
          autoComplete="current-password"
          className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm text-ink outline-none focus:border-cyan-600"
          minLength={6}
          name="password"
          required
          type="password"
        />
      </label>
    </div>
  );
}
