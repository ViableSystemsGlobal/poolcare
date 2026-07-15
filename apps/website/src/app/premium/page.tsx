import { PlanPage } from "@/components/PlanPage";
import { planMetadata } from "@/lib/seo";

export const generateMetadata = () => planMetadata("premium");

export default function Premium() {
  return <PlanPage planKey="premium" home="/" />;
}
