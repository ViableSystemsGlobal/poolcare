import { LegalPage } from "@/components/LegalPage";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = () => pageMetadata({ key: "page.disclaimer", path: "/disclaimer", fallbackTitle: "Disclaimer — PoolCare" });

export default function Disclaimer() {
  return <LegalPage docKey="disclaimer" home="/" />;
}
