import { PlanPage } from "@/components/PlanPage";
import { planMetadata, planServiceSchema, breadcrumbSchema } from "@/lib/seo";
import { JsonLd } from "@/lib/structured-data";

export const generateMetadata = () => planMetadata("flex");

export default async function Flex() {
  const service = await planServiceSchema("flex");
  const crumbs = breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Services & Plans", path: "/services-plans" },
    { name: "Flex Plan", path: "/flex" },
  ]);
  return (
    <>
      {service && <JsonLd data={service} />}
      <JsonLd data={crumbs} />
      <PlanPage planKey="flex" home="/" />
    </>
  );
}
