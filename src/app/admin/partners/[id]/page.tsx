import { AdminPartnerDetailClient } from "./AdminPartnerDetailClient";

export default function AdminPartnerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <AdminPartnerDetailClient partnerId={params.id} />;
}
