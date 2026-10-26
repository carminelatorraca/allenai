import { redirect } from "next/navigation";

// Il calendario è stato assorbito dalla home: questa rotta resta solo per
// non rompere link o scorciatoie salvate in precedenza.
export default async function CalendarRedirect({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  redirect(date ? `/dashboard?date=${encodeURIComponent(date)}` : "/dashboard");
}
