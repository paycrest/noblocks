import config from "./lib/config";

export default function Head() {
  const { appUrl } = config;

  const baseUrl = appUrl.replace(/\/$/, "");
  const miniAppJson = JSON.stringify({
    url: baseUrl,
    window: { height: 600, width: 400 },
  });

  return (
    <>
      <title>Noblocks - Decentralized Payments Interface</title>
      <meta
        name="description"
        content="The first interface for decentralized payments to any bank or mobile wallet, powered by a distributed network of liquidity nodes."
      />

      {/* Farcaster Mini App embed */}
      <meta name="fc:miniapp" content={miniAppJson} />

      <meta property="fc:frame:button:1:target" content={baseUrl} />

      {/* Keep your other important tags */}
      <link rel="icon" href="/favicon.ico" />
    </>
  );
}
