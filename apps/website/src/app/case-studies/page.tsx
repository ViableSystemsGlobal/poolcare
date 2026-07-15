import { pageMetadata } from "@/lib/seo";
import CaseStudiesClient from "./case-studies-client";

export const generateMetadata = () =>
  pageMetadata({ key: "page.case-studies", path: "/case-studies", fallbackTitle: "Case Studies — Real PoolCare Projects" });

export default function CaseStudies() {
  return <CaseStudiesClient />;
}
