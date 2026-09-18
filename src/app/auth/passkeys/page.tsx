import { redirect } from "next/navigation";

/** Passkeys moved into Settings → Account; old links and bookmarks still land there. */
export default function PasskeysPage() {
  redirect("/settings/account");
}
