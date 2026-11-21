import { Redirect } from "expo-router";

/** Legacy `/` → Home (default tab). Kept so older `router.replace("/")` still lands correctly. */
export default function TabsIndexRedirect() {
  return <Redirect href="/home" />;
}
