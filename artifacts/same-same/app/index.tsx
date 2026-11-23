import { Redirect } from "expo-router";

/** `/` outside the tab navigator → Home (default tab). */
export default function RootIndex() {
  return <Redirect href="/home" />;
}
