import { notFound } from "next/navigation";
import {
  isAllowedWalletTokenSymbol,
  resolveWalletTokenMeta,
} from "@/app/lib/wallet-token-allowlist";
import { canonicalTokenSymbol } from "@/app/lib/token-symbol";
import { TokenDetailContent } from "@/app/(wallet)/components/tokens/TokenDetailContent";

type PageProps = {
  params: Promise<{ symbol: string }>;
};

export default async function TokenSymbolPage({ params }: PageProps) {
  const { symbol: rawSymbol } = await params;
  if (!isAllowedWalletTokenSymbol(rawSymbol)) {
    notFound();
  }
  const meta = resolveWalletTokenMeta(rawSymbol);
  if (!meta) notFound();

  const symbol = canonicalTokenSymbol(meta.symbol) ?? meta.symbol;

  return <TokenDetailContent symbol={symbol} />;
}
