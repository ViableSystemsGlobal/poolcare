import AsyncStorage from "@react-native-async-storage/async-storage";

const LOGO_KEY = "@poolcare/loader_logo_url";
const SPLASH_IMAGE_KEY = "@poolcare/splash_image_url";
const SPLASH_BG_KEY = "@poolcare/splash_bg_color";

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

export async function getCachedSplashImage(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SPLASH_IMAGE_KEY);
  } catch {
    return null;
  }
}

export async function setCachedSplashImage(url: string | null): Promise<void> {
  try {
    if (url) {
      await AsyncStorage.setItem(SPLASH_IMAGE_KEY, url);
    } else {
      await AsyncStorage.removeItem(SPLASH_IMAGE_KEY);
    }
  } catch {}
}

export async function getCachedSplashBgColor(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SPLASH_BG_KEY);
  } catch {
    return null;
  }
}

export async function setCachedSplashBgColor(color: string | null): Promise<void> {
  try {
    if (color) {
      await AsyncStorage.setItem(SPLASH_BG_KEY, color);
    } else {
      await AsyncStorage.removeItem(SPLASH_BG_KEY);
    }
  } catch {}
}
