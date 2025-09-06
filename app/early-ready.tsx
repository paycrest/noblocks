// "use client";

// import { useEffect } from "react";

// export function EarlyReady() {
//   useEffect(() => {
//     let cancelled = false;
//     (async () => {
//       try {
//         if (
//           typeof window !== "undefined" &&
//           (window as any).__farcasterMiniAppReady
//         ) {
//           return;
//         }
//         const { sdk } = await import("@farcaster/miniapp-sdk");
//         if (cancelled) return;
//         console.log("✅ Ready called");
//         await sdk.actions.ready();
//         // Post defensive ready messages for hosts that listen to postMessage
//         try {
//           if (
//             typeof window !== "undefined" &&
//             window.parent &&
//             window.top !== window.self
//           ) {
//             const msgs = [
//               { type: "farcaster:ready" },
//               { type: "miniapp:ready" },
//               { type: "frame:ready" },
//               { type: "farcaster:miniapp:ready" },
//             ];
//             msgs.forEach((m) => {
//               try {
//                 window.parent!.postMessage(m as any, "*");
//               } catch {}
//             });
//           }
//         } catch {}
//         if (typeof window !== "undefined") {
//           (window as any).__farcasterMiniAppReady = true;
//         }
//       } catch (err) {
//         console.error("❌ Early ready failed", err);
//       }
//     })();
//     return () => {
//       cancelled = true;
//     };
//   }, []);

//   return null;
// }

"use client";
import { useEffect } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

export function EarlyReady() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      !(window as any).__farcasterMiniAppReady
    ) {
      sdk.actions.ready();
      (window as any).__farcasterMiniAppReady = true;
    }
  }, []);

  return null;
}
