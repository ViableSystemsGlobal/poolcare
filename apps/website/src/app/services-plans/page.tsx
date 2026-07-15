import { pageMetadata } from "@/lib/seo";
import ServicesPlansClient from "./services-plans-client";

export const generateMetadata = () =>
  pageMetadata({ key: "page.services-plans", path: "/services-plans", fallbackTitle: "Services & Plans — PoolCare" });

export default function ServicesPlans() {
  return <ServicesPlansClient />;
}
