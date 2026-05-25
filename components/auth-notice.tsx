import Link from "next/link";

type AuthNoticeProps = {
  message: string;
};

export function AuthNotice({ message }: AuthNoticeProps) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
      <p>{message}</p>
      <Link
        className="mt-3 inline-flex rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        href="/login"
      >
        Sign in
      </Link>
    </section>
  );
}
