"use client";
import {
    ReactNode,
    createContext,
    useContext,
    useState,
    useEffect,
    Suspense,
} from "react";
import { useSearchParams } from "next/navigation";

interface BaseAppContextType {
    isBaseApp: boolean;
    isFarcaster: boolean;
    baseAppWallet: string | null;
    baseAppReady: boolean;
    sdk: any | null;
}

const BaseAppContext = createContext<BaseAppContextType>({
    isBaseApp: false,
    isFarcaster: false,
    baseAppWallet: null,
    baseAppReady: false,
    sdk: null,
});

function BaseAppProviderContent({ children }: { children: ReactNode }) {
    const searchParams = useSearchParams();

    // Always start with false to ensure server/client hydration match
    // We'll update these in useEffect after mount
    const [isBaseAppEnv, setIsBaseAppEnv] = useState(false);
    const [isFarcasterEnv, setIsFarcasterEnv] = useState(false);
    const [baseAppWallet, setBaseAppWallet] = useState<string | null>(null);
    const [baseAppReady, setBaseAppReady] = useState(false);
    const [sdk, setSdk] = useState<any | null>(null);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);

        const initBaseApp = async () => {
            // Check for query params for local testing (including Farcaster pattern)
            const baseAppParam = searchParams?.get("baseApp");
            const miniParam = searchParams?.get("mini");
            const miniAppParam = searchParams?.get("miniApp");
            const shouldUseForTesting = baseAppParam === "true" || miniParam === "true" || miniAppParam === "true";

            if (typeof window === "undefined") {
                return;
            }

            // Check URL query param and pathname (Farcaster pattern: /mini pathname)
            const urlParams = new URLSearchParams(window.location.search);
            const urlPathname = window.location.pathname;
            const hasBaseAppParam = urlParams.get("baseApp") === "true" || urlParams.get("mini") === "true" || urlParams.get("miniApp") === "true";
            const hasMiniPathname = urlPathname.startsWith("/mini"); // Farcaster docs pattern

            // Check for Base App MiniKit API
            const hasMinikit = !!(window as any).minikit;

            // Check user agent for Base App/Farcaster
            const userAgent = window.navigator?.userAgent?.toLowerCase() || "";
            const hasBaseAppUA = userAgent.includes("baseapp");
            const hasFarcasterUA = userAgent.includes("farcaster") || userAgent.includes("warpcast");

            if (hasBaseAppParam || hasMiniPathname || hasMinikit || hasBaseAppUA) {
                setIsBaseAppEnv(true);
            }
            if (hasFarcasterUA || hasMiniPathname) {
                setIsFarcasterEnv(true);
            }

            try {
                // Import and initialize Farcaster MiniApp SDK (works for both Farcaster and Base App)
                const { sdk: farcasterSdk } = await import("@farcaster/miniapp-sdk");
                setSdk(farcasterSdk);

                try {
                    await farcasterSdk.actions.ready();
                    setBaseAppReady(true);
                } catch (readyError) {
                    // ready() may fail if not in actual mini app environment
                    console.warn("[BaseApp/Farcaster] SDK ready() call (may fail outside mini app):", readyError);
                    // For testing, mark as ready anyway
                    if (shouldUseForTesting) {
                        setBaseAppReady(true);
                    }
                }

                // Check if we're actually in a Mini App using SDK method
                let isInMiniApp = false;
                try {
                    isInMiniApp = await farcasterSdk.isInMiniApp();
                } catch (error) {
                    console.warn("[BaseApp/Farcaster] isInMiniApp() check failed:", error);
                }

                // Determine if it's Farcaster or Base App
                let isFarcaster = false;
                let isBaseApp = false;

                if (isInMiniApp || shouldUseForTesting) {
                    try {
                        const context = await farcasterSdk.context;
                        const platform = (context as any)?.client?.platformType;
                        const userAgent = window.navigator?.userAgent?.toLowerCase() || "";

                        // Check if it's Farcaster (Warpcast, etc.)
                        if (userAgent.includes("farcaster") || userAgent.includes("warpcast")) {
                            isFarcaster = true;
                        } else if (userAgent.includes("baseapp") || (window as any).minikit) {
                            // Check if it's Base App
                            isBaseApp = true;
                        } else if (platform === "mobile" || platform === "web") {
                            // Default to Farcaster if in mini app but platform type is generic
                            isFarcaster = true;
                        }

                        setIsFarcasterEnv(isFarcaster);
                        setIsBaseAppEnv(isBaseApp || shouldUseForTesting);

                        // Extract wallet address from user context
                        const walletAddress =
                            (context as any)?.user?.custodyAddress ||
                            (context as any)?.user?.verifications?.[0] ||
                            null;

                        if (walletAddress) {
                            setBaseAppWallet(walletAddress);
                            console.log("[BaseApp/Farcaster] Wallet address extracted:", walletAddress);
                        }
                    } catch (error) {
                        console.warn("[BaseApp/Farcaster] Failed to get context:", error);
                        // Default to Base App for testing
                        if (shouldUseForTesting) {
                            setIsBaseAppEnv(true);
                        }
                    }
                } else if (shouldUseForTesting) {
                    // For testing mode, default to Base App
                    setIsBaseAppEnv(true);
                    setBaseAppReady(true);
                }
            } catch (error) {
                console.error("[BaseApp/Farcaster] Failed to initialize SDK:", error);
                // For local testing, mark as ready even without SDK
                if (shouldUseForTesting) {
                    setIsBaseAppEnv(true);
                    setBaseAppReady(true);
                }
            }
        };

        initBaseApp();
    }, [searchParams]);

    return (
        <BaseAppContext.Provider
            value={{
                isBaseApp: isBaseAppEnv,
                isFarcaster: isFarcasterEnv,
                baseAppWallet,
                baseAppReady,
                sdk,
            }}
        >
            {children}
        </BaseAppContext.Provider>
    );
}

export const BaseAppProvider = ({ children }: { children: ReactNode }) => {
    return (
        <Suspense fallback={null}>
            <BaseAppProviderContent>{children}</BaseAppProviderContent>
        </Suspense>
    );
};

export const useBaseApp = () => useContext(BaseAppContext);
