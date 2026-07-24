import type { Metadata } from "next";

// Embeddable widget for whitelisted partner sites (iframed) — keep it out of
// search indexes; the canonical product page is /.
export const metadata: Metadata = {
  title: "Noblocks Widget",
  robots: {
    index: false,
    follow: false,
  },
};

export default function WidgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
