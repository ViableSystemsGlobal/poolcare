import { pageMetadata } from "@/lib/seo";
import BlogClient from "./blog-client";

export const generateMetadata = () =>
  pageMetadata({ key: "page.blog", path: "/blog", fallbackTitle: "Pool Care Tips & Guides — PoolCare Blog" });

export default function BlogIndex() {
  return <BlogClient />;
}
