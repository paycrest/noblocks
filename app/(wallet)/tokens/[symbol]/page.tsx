import { notFound } from "next/navigation";
import {
  isAllowedWalletTokenSymbol,
  resolveWalletTokenMeta,
} from "@/app/lib/wallet-token-allowlist";
import { WalletPlaceholderPage } from "../../components/WalletPlaceholderPage";

type PageProps = {
  params: Promise<{ symbol: string }>;
};

export default async function TokenSymbolPage({ params }: PageProps) {
  const { symbol } = await params;
  if (!isAllowedWalletTokenSymbol(symbol)) {
    notFound();
  }
  const meta = resolveWalletTokenMeta(symbol);
  if (!meta) notFound();

  return (
    <WalletPlaceholderPage
      title={meta.name}
      description={`Token detail for ${meta.symbol}.`}
    />
  );
}
