import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { getFirebaseWebKey } from "@/durrat/api/firebase-config.functions";

const DurratApp = lazy(async () => {
  try {
    const { apiKey } = await getFirebaseWebKey();
    (globalThis as { __DURRAT_FIREBASE_KEY__?: string }).__DURRAT_FIREBASE_KEY__ = apiKey;
  } catch (err) {
    console.error("Failed to load Firebase key", err);
  }
  return import("@/durrat/App-entry");
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "درة الهجرة للعقارات | عقارات للبيع والإيجار في المدينة المنورة" },
      { name: "description", content: "منصة درة الهجرة للعقارات: تصفح عقارات للبيع والإيجار في المدينة المنورة والمملكة مع الخريطة والتواصل المباشر." },
      { property: "og:title", content: "درة الهجرة للعقارات" },
      { property: "og:description", content: "عقارات للبيع والإيجار في المدينة المنورة والمملكة العربية السعودية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Loading() {
  return <div style={{ minHeight: "100vh" }} />;
}

function Index() {
  return (
    <ClientOnly fallback={<Loading />}>
      <Suspense fallback={<Loading />}>
        <DurratApp />
      </Suspense>
    </ClientOnly>
  );
}
