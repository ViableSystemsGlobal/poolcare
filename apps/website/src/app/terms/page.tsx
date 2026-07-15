import { LegalPage } from "@/components/LegalPage";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = () => pageMetadata({ key: "page.terms", path: "/terms", fallbackTitle: "Terms & Conditions — PoolCare" });

export default function Terms() {
  return <LegalPage docKey="terms" home="/" />;
}
