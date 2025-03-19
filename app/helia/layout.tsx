import { type Metadata } from "next";

/**
 * Metadata for the Helia Storage Test page
 */
export const metadata: Metadata = {
  title: "Structured Data with Helia | Noblocks",
  description: "Content-addressable storage with Helia DAG JSON",
};

/**
 * Layout component for the storage test page
 */
export default function HeliaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background-neutral dark:bg-neutral-900">
      <div className="mx-auto max-w-7xl">
        <main>{children}</main>
      </div>
    </div>
  );
}
