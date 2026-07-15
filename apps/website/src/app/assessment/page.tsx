import { pageMetadata } from "@/lib/seo";
import AssessmentClient from "./assessment-client";

export const generateMetadata = () =>
  pageMetadata({ key: "page.assessment", path: "/assessment", fallbackTitle: "Book a Free Pool Assessment — PoolCare" });

export default function Assessment() {
  return <AssessmentClient />;
}
