export default function Head() {
  // const miniAppJson = JSON.stringify({
  //   url: "https://noblockz.vercel.app",
  //   window: { height: 600, width: 400 },
  // });
  const appUrl = process.env.NEXT_PUBLIC_URL || "https://noblocks.vercel.app";
  const miniAppJson = JSON.stringify({
    url: appUrl,
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
      <meta property="fc:frame" content="vNext" />
      <meta
        property="fc:frame:image"
        content="https://noblockz.vercel.app//desktop-wide.png"
      />
      <meta property="fc:frame:button:1" content="Open App" />
      <meta property="fc:frame:button:1:action" content="link" />
      <meta
        property="fc:frame:button:1:target"
        content="https://noblockz.vercel.app?injected=true"
      />

      {/* Keep your other important tags */}
      <link rel="icon" href="/favicon.ico" />
    </>
  );
}
