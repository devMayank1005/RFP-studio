import { redirect } from "next/navigation";

/** The root is never a page: signed-in users land on the dashboard, everyone else on sign-in via proxy. */
export default function Home() {
  redirect("/dashboard");
}
