import { pageMetadata } from "@/lib/seo";
import CareersClient from "./careers-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export const generateMetadata = () =>
  pageMetadata({
    key: "page.careers",
    path: "/careers",
    fallbackTitle: "Careers at PoolCare — Join Our Accra Team",
    fallbackDesc:
      "Open roles at PoolCare — pool technicians and support staff keeping Accra's pools clear, balanced and monitored. See openings and apply online.",
  });

export const revalidate = 60;

async function getRoles(): Promise<any[]> {
  try {
    const r = await fetch(`${API_BASE}/public/careers`, { next: { revalidate: 60 } });
    return r.ok ? (await r.json()).postings || [] : [];
  } catch {
    return [];
  }
}

export default async function Careers() {
  const roles = await getRoles();
  return <CareersClient roles={roles} />;
}
