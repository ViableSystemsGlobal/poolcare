import { pageMetadata } from "@/lib/seo";
import ProductsClient from "./products-client";

export const generateMetadata = () =>
  pageMetadata({ key: "page.products", path: "/products", fallbackTitle: "PoolCare Products — Branded Pool Chemicals" });

export default function Products() {
  return <ProductsClient />;
}
