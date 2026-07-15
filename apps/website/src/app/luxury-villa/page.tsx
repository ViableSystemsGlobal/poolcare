import { PlanPage } from "@/components/PlanPage";
import { planMetadata } from "@/lib/seo";

export const generateMetadata = () => planMetadata("luxury-villa");

export default function LuxuryVilla() {
  return <PlanPage planKey="luxury-villa" home="/" />;
}
