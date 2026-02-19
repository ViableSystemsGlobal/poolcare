import { Platform } from "react-native";

/**
 * Get the network IP address for mobile devices
 * On mobile, localhost doesn't work, so we need to use the actual network IP
 */
export const getNetworkIp = (): string => {
  // Use environment variable if set, otherwise use detected network IP
  return (
    process.env.EXPO_PUBLIC_NETWORK_IP ||
    process.env.NETWORK_IP ||
    "192.168.1.73" // Default – override with EXPO_PUBLIC_NETWORK_IP or EXPO_PUBLIC_API_URL in .env to match your Mac's IP
  );
};

/**
 * Replace localhost with network IP in URLs for mobile platforms,
 * and rewrite old Render hostnames to the public API domain.
 */
export const fixUrlForMobile = (url: string | null | undefined): string => {
  if (!url) return "";

  let fixed = url;

  // Rewrite old Render internal hostname to the public API domain
  fixed = fixed.replace(
    /https?:\/\/poolcare-ef74\.onrender\.com/g,
    "https://api.poolcare.africa"
  );

  // iOS Simulator (or explicit localhost mode): keep localhost as-is — it works
  if (process.env.EXPO_PUBLIC_USE_LOCALHOST === "true") {
    return fixed;
  }

  // On native, replace localhost with the Mac's LAN IP
  if (Platform.OS !== "web" && fixed.includes("localhost")) {
    const networkIp = getNetworkIp();
    fixed = fixed.replace("localhost", networkIp);
  }

  return fixed;
};


