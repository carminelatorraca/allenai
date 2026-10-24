
import { Suspense } from "react";
import MesocycleDetail from "./MesocycleDetail";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function Page({ params }: PageProps) {
  return (
    <Suspense fallback={<div className="plan-detail__loading">Caricamento mesociclo...</div>}>
      <PageContent params={params} />
    </Suspense>
  );
}

async function PageContent({ params }: PageProps) {
  const { id } = await params;

  return <MesocycleDetail mesocycleId={id} />;
}
