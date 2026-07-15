import { LegalPage } from "@/components/LegalPage";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = () => pageMetadata({ key: "page.privacy-policy", path: "/privacy-policy", fallbackTitle: "Privacy Policy — PoolCare" });

export default function PrivacyPolicy() {
  return <LegalPage docKey="privacy-policy" home="/" />;
}
