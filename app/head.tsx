export default function Head() {
  return (
    <>
      {/* Farcaster Mini App Embed */}
      <meta
        name="fc:miniapp"
        content='{"url":"https://noblockz.vercel.app","window":{"height":600,"width":400}}'
      />
      <meta
        name="fc:frame"
        content='{"url":"https://noblockz.vercel.app","window":{"height":600,"width":400}}'
      />

      {/* SEO + PWA Meta */}
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="msapplication-TileColor" content="#317EFB" />
      <meta name="msapplication-tap-highlight" content="no" />

      {/* Title + Description */}
      <title>Noblocks - Decentralized Payments Interface</title>
      <meta
        name="description"
        content="The first interface for decentralized payments to any bank or mobile wallet, powered by a distributed network of liquidity nodes."
      />

      {/* Icons */}
      <link rel="icon" href="/favicon.ico" />
      <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />

      {/* Open Graph */}
      <meta property="og:title" content="Noblocks" />
      <meta
        property="og:description"
        content="The first interface for decentralized payments to any bank or mobile wallet, powered by a distributed network of liquidity nodes."
      />
      <meta property="og:image" content="/images/og-image.jpg" />
      <meta property="og:url" content="https://noblocks.xyz" />
      <meta property="og:type" content="website" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Noblocks" />
      <meta
        name="twitter:description"
        content="The first interface for decentralized payments to any bank or mobile wallet, powered by a distributed network of liquidity nodes."
      />
      <meta name="twitter:image" content="/images/og-image.jpg" />
    </>
  );
}
