export default function Head() {
  const miniAppJson = JSON.stringify({
    url: "https://noblockz.vercel.app",
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
      <meta name="fc:frame" content={miniAppJson} />

      {/* Keep your other important tags */}
      <link rel="icon" href="/favicon.ico" />
    </>
  );
}
