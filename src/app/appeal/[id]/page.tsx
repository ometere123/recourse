import { AppealForm } from "@/components/appeal-form";

export default async function AppealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppealForm id={id} />;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Appeal ${id}` };
}
