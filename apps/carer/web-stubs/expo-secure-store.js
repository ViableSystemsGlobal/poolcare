// Web shim: expo-secure-store is native-only (it throws
// "deleteValueWithKeyAsync is not a function" on web). The carer app only
// uses these three methods, so back them with localStorage for local web
// testing. Aliased in metro.config.js for platform === 'web' only — native
// builds still use the real expo-secure-store.
const PREFIX = "secure-store:";

export async function getItemAsync(key) {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export async function setItemAsync(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* storage unavailable (private window, blocked cookies) */
  }
}

export async function deleteItemAsync(key) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* storage unavailable */
  }
}

export default { getItemAsync, setItemAsync, deleteItemAsync };
