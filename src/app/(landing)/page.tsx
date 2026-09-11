import { getT } from "@/features/core/i18n/server";

export default async function HomePage() {
  const { t } = await getT();
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <h1 className="font-display text-3xl">{t("appName")}</h1>
    </main>
  );
}
