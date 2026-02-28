import AsyncStorage from "@react-native-async-storage/async-storage";

const LOGO_KEY = "@poolcare/loader_logo_url";

export async function getCachedLogoUrl(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LOGO_KEY);
  } catch {
    return null;
  }
}

export async function setCachedLogoUrl(url: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LOGO_KEY, url);
  } catch {}
}
