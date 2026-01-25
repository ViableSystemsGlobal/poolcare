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
    "192.168.0.167" // Default to current network IP
  );
};

/**
 * Replace localhost with network IP in URLs for mobile platforms
 */
export const fixUrlForMobile = (url: string | null | undefined): string => {
  if (!url) return "";
  
  // Only replace on mobile platforms
  if (Platform.OS !== "web" && url.includes("localhost")) {
    const networkIp = getNetworkIp();
    return url.replace("localhost", networkIp);
  }
  
  return url;
};


