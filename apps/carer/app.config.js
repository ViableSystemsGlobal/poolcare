const base = require("./app.json");

// The EAS-stored key carries a leading newline; Google rejects it untrimmed.
const mapsKey = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim();

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    scheme: "poolcare-carer",
    ios: {
      ...base.expo.ios,
      config: {
        googleMapsApiKey: mapsKey || base.expo.ios?.config?.googleMapsApiKey || "",
      },
    },
    android: {
      ...base.expo.android,
      config: {
        googleMaps: {
          apiKey: mapsKey || base.expo.android?.config?.googleMaps?.apiKey || "",
        },
      },
    },
    extra: {
      ...base.expo.extra,
      eas: {
        projectId: "b53852a4-0450-4e67-9690-9564c55cce66",
      },
    },
  },
};
