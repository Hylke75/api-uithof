import { redirect } from "next/navigation";

/** Oude adres: bladwijzers blijven werken. */
export default async function OudeFactuur({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/facturen/${encodeURIComponent(id)}`);
}
