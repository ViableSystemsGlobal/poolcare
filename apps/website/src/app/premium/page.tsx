import { PlanPage } from "@/components/PlanPage";
import { planMetadata, planServiceSchema, breadcrumbSchema } from "@/lib/seo";
import { JsonLd } from "@/lib/structured-data";

export const generateMetadata = () => planMetadata("premium");

export default async function Premium() {
  const service = await planServiceSchema("premium");
  const crumbs = breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Services & Plans", path: "/services-plans" },
    { name: "Premium Plan", path: "/premium" },
  ]);
  return (
    <>
      {service && <JsonLd data={service} />}
      <JsonLd data={crumbs} />
      <PlanPage planKey="premium" home="/" />
    </>
  );
}
