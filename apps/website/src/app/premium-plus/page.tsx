import { PlanPage } from "@/components/PlanPage";
import { planMetadata, planServiceSchema, breadcrumbSchema } from "@/lib/seo";
import { JsonLd } from "@/lib/structured-data";

export const generateMetadata = () => planMetadata("premium-plus");

export default async function PremiumPlus() {
  const service = await planServiceSchema("premium-plus");
  const crumbs = breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Services & Plans", path: "/services-plans" },
    { name: "Premium Plus Plan", path: "/premium-plus" },
  ]);
  return (
    <>
      {service && <JsonLd data={service} />}
      <JsonLd data={crumbs} />
      <PlanPage planKey="premium-plus" home="/" />
    </>
  );
}
