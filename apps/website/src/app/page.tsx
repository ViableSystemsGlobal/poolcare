import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Trust } from "@/components/Trust";
import { Services } from "@/components/Services";
import { HowItWorks } from "@/components/HowItWorks";
import { Quote } from "@/components/Quote";
import { Gallery } from "@/components/Gallery";
import { Reviews } from "@/components/Reviews";
import { FAQ } from "@/components/FAQ";
import { AppDownload } from "@/components/AppDownload";
import { Footer } from "@/components/Footer";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, faqSchema } from "@/lib/structured-data";

export const generateMetadata = () =>
  pageMetadata({ key: "page.home", path: "/", fallbackTitle: "PoolCare — Professional Pool Maintenance in Accra, Ghana" });

// Homepage composition. The full plan/pricing grid now lives on /services-plans,
// the assessment form on /assessment, and the service-area map on /about.
// The Quote section is the homepage's single conversion point.
export default async function HomePage() {
  const faq = await faqSchema();
  return (
    <>
      {faq && <JsonLd data={faq} />}
      <Nav />
      <main>
        <Hero imageKey="technician" />
        <Trust />
        <Services showSpecialized={false} />
        <HowItWorks />
        <Quote />
        <Gallery />
        <Reviews />
        <FAQ />
        <AppDownload />
      </main>
      <Footer />
    </>
  );
}
