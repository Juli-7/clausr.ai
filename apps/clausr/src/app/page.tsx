import { ComplianceLayout } from "@/components/compliance/compliance-layout";

export default function CompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  return <ComplianceLayoutWrapper searchParams={searchParams} />;
}

async function ComplianceLayoutWrapper({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const params = await searchParams;
  return <ComplianceLayout sessionId={params.session} />;
}
