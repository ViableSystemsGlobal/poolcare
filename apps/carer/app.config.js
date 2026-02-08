const base = require("./app.json");

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    scheme: "poolcare-carer",
    ios: {
      ...base.expo.ios,
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || base.expo.ios?.config?.googleMapsApiKey || "",
      },
    },
    android: {
      ...base.expo.android,
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || base.expo.android?.config?.googleMaps?.apiKey || "",
        },
      },
    },
  },
};
