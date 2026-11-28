import { notFound } from "next/navigation";
import LicensingPanel from "./licensing-panel";
export const dynamic = "force-dynamic";
export default function InstitutionalLicensingPage() {
  if (
    process.env.INSTITUTIONAL_MVP_ENABLED !== "true" ||
    process.env.INSTITUTIONAL_LICENSING_ENABLED !== "true"
  )
    notFound();
  return <LicensingPanel />;
}
