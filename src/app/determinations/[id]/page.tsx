import { DeterminationDetail } from "@/components/determination-detail";

/**
 * Next 16: route params arrive as a Promise and must be awaited. This wrapper
 * exists only to do that; everything below it is a client component because the
 * page holds write state.
 */
export default async function DeterminationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DeterminationDetail id={id} />;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Determination ${id}` };
}
