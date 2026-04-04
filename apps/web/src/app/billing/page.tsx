"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BillingPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/invoices");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-500">Redirecting to Invoices...</p>
    </div>
  );
}
