import { ContactPage } from "@/components/ContactPage";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = () =>
  pageMetadata({ key: "page.contact", path: "/contact", fallbackTitle: "Contact PoolCare — Pool Service in Accra" });

export default function Contact() {
  return <ContactPage home="/" />;
}
