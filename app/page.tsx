"use client";
import { Suspense } from "react";
import { Preloader } from "./components";
import { HomePage } from "./components/HomePage";
import { useSearchParams } from "next/navigation";

function SearchParamsWrapper(props: {
  children: (sp: URLSearchParams) => React.ReactNode;
}) {
  const searchParams = useSearchParams();
  return <>{props.children(searchParams)}</>;
}

export default function Page() {
  return (
    <Suspense fallback={<Preloader isLoading={true} />}>
      <SearchParamsWrapper>
        {(sp) => <HomePage searchParams={sp} />}
      </SearchParamsWrapper>
    </Suspense>
  );
}
