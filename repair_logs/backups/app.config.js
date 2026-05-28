/**
 * Dynamic Expo config: derives expo-router `origin` from your API env.
 * Static fields stay in app.json.
 */
const appJson = require("./app.json");

module.exports = () => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim()?.replace(/\/+$/, "");
  const origin =
    process.env.EXPO_PUBLIC_APP_ORIGIN?.trim()?.replace(/\/+$/, "") ||
    apiUrl ||
    (domain
      ? `https://${domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`
      : "http://127.0.0.1:8081");

  const plugins = (appJson.expo.plugins ?? []).map((entry) => {
    if (Array.isArray(entry) && entry[0] === "expo-router") {
      return ["expo-router", { ...(entry[1] ?? {}), origin }];
    }
    return entry;
  });

  return {
    ...appJson.expo,
    plugins,
  };
};
