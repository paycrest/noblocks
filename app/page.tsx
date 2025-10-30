import { Suspense } from "react";
import { Preloader } from "./components";
import { MainPageContent } from "./components/MainPageContent";

export const dynamic = "force-static";

export default function Page() {
  return (
    <Suspense fallback={<Preloader isLoading={true} />}>
      <MainPageContent />
    </Suspense>
  );
}
