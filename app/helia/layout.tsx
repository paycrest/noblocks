import { type Metadata } from "next";

/**
 * Metadata for the Helia Storage Test page
 */
export const metadata: Metadata = {
  title: "Decentralized Storage | Noblocks",
  description:
    "Test page for content-addressable decentralized storage with Helia and IPFS",
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl">
        <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
          <h1 className="text-lg font-medium text-gray-900 dark:text-white">
            Noblocks Decentralized Storage with IPFS
          </h1>
        </div>
        <main>{children}</main>
      </div>
    </div>
  );
}
