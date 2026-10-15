// Web stub: react-native-maps is native-only. app/jobs/[id].tsx already
// degrades to a fallback map when the module is unavailable, so throwing
// here keeps that path working on web instead of failing the bundle.
throw new Error("react-native-maps is not available on web");
