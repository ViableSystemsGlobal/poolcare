import { PlanPage } from "@/components/PlanPage";
import { planMetadata, planServiceSchema, breadcrumbSchema } from "@/lib/seo";
import { JsonLd } from "@/lib/structured-data";

export const generateMetadata = () => planMetadata("luxury-villa");

export default async function LuxuryVilla() {
  const service = await planServiceSchema("luxury-villa");
  const crumbs = breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Services & Plans", path: "/services-plans" },
    { name: "Luxury Villa Plan", path: "/luxury-villa" },
  ]);
  return (
    <>
      {service && <JsonLd data={service} />}
      <JsonLd data={crumbs} />
      <PlanPage planKey="luxury-villa" home="/" />
    </>
  );
}
