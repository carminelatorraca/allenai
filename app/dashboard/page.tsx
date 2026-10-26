import { Suspense } from "react";
import DashboardClient from "./DashboardClient";

type PageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default function Page({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<div className="home-loading">Caricamento AllenAI...</div>}>
      <PageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PageContent({ searchParams }: PageProps) {
  const { date } = await searchParams;
  return <DashboardClient initialDate={date} />;
}
