"use client";
import { Suspense } from "react";
import { Preloader } from "./components";
import { HomePage } from "./components/HomePage";

export default function Page() {
  return (
    <Suspense fallback={<Preloader isLoading={true} />}>
      <HomePage />
    </Suspense>
  );
}
