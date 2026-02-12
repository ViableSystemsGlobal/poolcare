import { useEffect } from "react";
import { router } from "expo-router";

/**
 * Redirect to the unified Request screen in "report" mode.
 * Book a Service and Report an Issue are now one screen with two tabs.
 */
export default function ReportIssueScreen() {
  useEffect(() => {
    router.replace("/book-service?mode=report");
  }, []);

  return null;
}
