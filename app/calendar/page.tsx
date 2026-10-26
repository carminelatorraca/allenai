import { Suspense } from "react";
import { redirect } from "next/navigation";

// Il calendario è stato assorbito dalla home: questa rotta resta solo per
// non rompere link o scorciatoie salvate in precedenza.
type PageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default function CalendarRedirect({ searchParams }: PageProps) {
  return (
    <Suspense fallback={null}>
      <RedirectContent searchParams={searchParams} />
    </Suspense>
  );
}

async function RedirectContent({ searchParams }: PageProps) {
  const { date } = await searchParams;
  redirect(date ? `/dashboard?date=${encodeURIComponent(date)}` : "/dashboard");
  return null;
}
