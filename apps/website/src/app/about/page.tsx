import { pageMetadata } from "@/lib/seo";
import AboutClient from "./about-client";

export const generateMetadata = () =>
  pageMetadata({ key: "page.about", path: "/about", fallbackTitle: "About PoolCare — Our Team & System" });

export default function AboutPage() {
  return <AboutClient />;
}
