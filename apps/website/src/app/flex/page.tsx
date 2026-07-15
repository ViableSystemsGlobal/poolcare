import { PlanPage } from "@/components/PlanPage";
import { planMetadata } from "@/lib/seo";

export const generateMetadata = () => planMetadata("flex");

export default function Flex() {
  return <PlanPage planKey="flex" home="/" />;
}
