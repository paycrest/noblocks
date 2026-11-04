type WalletPlaceholderPageProps = {
  title: string;
  description?: string;
};

export function WalletPlaceholderPage({
  title,
  description,
}: WalletPlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-text-body dark:text-white">
        {title}
      </h1>
      {description ? (
        <p className="mt-2 text-sm text-text-secondary dark:text-white/60">
          {description}
        </p>
      ) : null}
    </div>
  );
}
