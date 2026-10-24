
import { Suspense } from "react";
import PlanDetail from "./PlanDetail";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function Page({ params }: PageProps) {
  return (
    <Suspense fallback={<p className="nplan-loading">Caricamento piano...</p>}>
      <PageContent params={params} />
    </Suspense>
  );
}

async function PageContent({ params }: PageProps) {
  const { id } = await params;
  return <PlanDetail planId={id} />;
}
