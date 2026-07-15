import { PlanPage } from "@/components/PlanPage";
import { planMetadata } from "@/lib/seo";

export const generateMetadata = () => planMetadata("premium-plus");

export default function PremiumPlus() {
  return <PlanPage planKey="premium-plus" home="/" />;
}
