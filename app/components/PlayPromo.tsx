"use client";

/**
 * Noblocks Play promo — homepage-only modal + banner (Figma:
 * node 2135-87421 modal, node 2135-79717 banner). Assets are the exact
 * exports from the design (public/images/play-promo/).
 *
 * Modal: shown once per visitor (dismiss = never again, via localStorage),
 * fixed to the mobile design size on every breakpoint.
 * Banner: dismissible for the current page visit only (reappears on refresh
 * or a new visit). Shown under the navbar while Noblocks Play is enabled.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { IoClose } from "react-icons/io5";
import { ArrowDown01Icon } from "hugeicons-react";
import { Dialog, DialogPanel } from "@headlessui/react";
import { motion, AnimatePresence } from "framer-motion";
import config from "../lib/config";
import { NoblocksAnimatedIcon } from "./NoblocksAnimatedIcon";

const ASSET = (name: string) => `/images/play-promo/${name}`;

// ---------------------------------------------------------------------------
// Decorative swoosh (the visible wave shape behind the players) + the very
// subtle grid texture on top of it. Both are exact exports from the design;
// the swoosh is intentionally oversized and bleeds past its container's
// edges, clipped by the parent's overflow-hidden.
// ---------------------------------------------------------------------------

const ModalBackdrop = () => (
  <div className="pointer-events-none absolute inset-0" aria-hidden="true">
    <img
      src={ASSET("vector7984.svg")}
      alt=""
      className="pointer-events-none absolute scale-125"
      style={{ left: "0.64%", top: "-5%", width: "287.74%", height: "59.10%" }}
    />
    <img
      src={ASSET("modal-bg.png")}
      alt=""
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  </div>
);

const BannerBackdrop = () => (
  <>
    <img
      src={ASSET("vector7984.svg")}
      alt=""
      className="pointer-events-none absolute"
      style={{ left: "37.44%", top: "-107.50%", width: "208.75%", height: "622.47%" }}
    />
    <img
      src={ASSET("banner-bg.png")}
      alt=""
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  </>
);

// ---------------------------------------------------------------------------
// Shared collage layer (trophy + the three player cutouts) — reused at
// modal scale and, cropped small, at banner scale.
// ---------------------------------------------------------------------------

const Collage = () => (
  <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true">
    <img
      src={ASSET("trophy.svg")}
      alt=""
      className="pointer-events-none absolute"
      style={{ left: "43.24%", top: "-0.83%", width: "27.48%", height: "53.25%" }}
    />
    <img
      src={ASSET("olise.png")}
      alt=""
      className="pointer-events-none absolute object-cover "
      style={{ left: "48.84%", top: "5.01%", width: "46.68%", height: "52.91%" }}
    />
    <img
      src={ASSET("ronaldo.png")}
      alt=""
      className="pointer-events-none absolute object-cover"
      style={{ left: "59.59%", top: "17.49%", width: "37.75%", height: "87.04%" }}
    />
    <img
      src={ASSET("messi.png")}
      alt=""
      className="pointer-events-none absolute object-cover"
      style={{ left: "5.60%", top: "18.83%", width: "100.13%", height: "71.21%" }}
    />
  </div>
);

// ---------------------------------------------------------------------------
// Dismiss-forever modal
// ---------------------------------------------------------------------------

const MODAL_STORAGE_KEY = "noblocks_play_promo_dismissed";
const BANNER_STORAGE_KEY = "noblocks_play_promo_banner_dismissed";

const BANNER_DISMISS_EVENT = "noblocks-play-promo-banner-dismiss";

function isBannerDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(BANNER_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Banner visibility for AppLayout margin. Once dismissed it stays hidden
 * across visits (localStorage); the Play button takes its place.
 */
export function usePlayPromoBannerVisible() {
  const [visible, setVisible] = useState(() =>
    typeof window === "undefined" ? false : !isBannerDismissed(),
  );
  const [ready, setReady] = useState(() => typeof window !== "undefined");

  useEffect(() => {
    const sync = () => setVisible(!isBannerDismissed());
    sync();
    setReady(true);
    window.addEventListener(BANNER_DISMISS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(BANNER_DISMISS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!ready) return false;
  return visible;
}

function markBannerDismissed() {
  try {
    localStorage.setItem(BANNER_STORAGE_KEY, "1");
  } catch {
    // Storage may be unavailable (private browsing etc.) — worst case the
    // banner shows again next visit, never worse than that.
  }
  window.dispatchEvent(new Event(BANNER_DISMISS_EVENT));
}

function isModalDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MODAL_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markModalDismissed() {
  try {
    localStorage.setItem(MODAL_STORAGE_KEY, "1");
  } catch {
    // Storage may be unavailable (private browsing etc.) — worst case it
    // shows again next visit, never worse than that.
  }
}

export function PlayPromoModal() {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !config.fantasyEnabled) return;
    if (isModalDismissed()) return;
    const timer = setTimeout(() => setIsOpen(true), 500);
    return () => clearTimeout(timer);
  }, [mounted]);

  const dismiss = useCallback(() => {
    markModalDismissed();
    setIsOpen(false);
  }, []);

  if (!config.fantasyEnabled || !mounted) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog
          static
          open={isOpen}
          onClose={dismiss}
          className="relative z-[100]"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
            aria-hidden="true"
          />

          <div className="pointer-events-none fixed inset-0 z-[101] flex items-center justify-center p-4">
            <DialogPanel className="pointer-events-auto relative w-full max-w-[450px]">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                <div
                  className="relative overflow-hidden rounded-[28px] bg-lavender-500 shadow-2xl w-[315px] h-[393px] md:w-[450px] md:h-[560px]"
                  style={{ containerType: "inline-size" }}
                >
                  <ModalBackdrop />
                  <Collage />

                  <div
                    className="absolute z-20 flex items-center justify-center"
                    style={{ left: "5.99%", top: "5.52%", width: "13.71%", height: "11.13%" }}
                  >
                    <NoblocksAnimatedIcon phases={["ball", "trophy"]} className="size-[32px]" />
                  </div>

                  <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Dismiss"
                    className="absolute z-30 flex items-center justify-center rounded-full border border-white/30 bg-white/30 backdrop-blur-sm transition-colors hover:bg-white/40"
                    style={{ left: "88.23%", top: "4.19%", width: "8.54%", height: "6.91%" }}
                  >
                    <img src={ASSET("close-icon.svg")} alt="" className="pointer-events-none h-1/2 w-1/2" />
                  </button>

                  <h2
                    className="absolute z-10 font-bold text-[#F5F5F5]"
                    style={{
                      left: "8.4943%",
                      top: "54.2398%",
                      width: "47.6834%",
                      fontSize: "10.821cqw",
                      lineHeight: 0.761,
                      letterSpacing: "-0.7575cqw",
                    }}
                  >
                    Predict.
                    <br />
                    Compete.
                    <br />
                    Win.
                  </h2>

                  <p
                    className="absolute z-10 text-[#F5F5F5]"
                    style={{
                      left: "8.4943%",
                      top: "76.5802%",
                      width: "53.0245%",
                      fontSize: "2.28cqw",
                      lineHeight: 1.351,
                      letterSpacing: "-0.0456cqw",
                    }}
                  >
                    Build your fantasy squad, earn points from real World Cup
                    performances, climb the leaderboard, and win exclusive
                    rewards.
                  </p>

                  <Link
                    href="/play"
                    onClick={dismiss}
                    className="absolute z-30 flex items-center justify-center rounded-full bg-white font-semibold text-black transition-transform active:scale-[0.98]"
                    style={{
                      left: "6.9182%",
                      top: "86.9085%",
                      width: "86.1635%",
                      height: "8.9036%",
                      fontSize: "3.33cqw",
                    }}
                  >
                    Play now
                  </Link>
                </div>
              </motion.div>
            </DialogPanel>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Persistent top banner — visible for as long as Play is enabled.
// ---------------------------------------------------------------------------

/** Mini collage thumbnail exactly as cropped in the banner design (Figma
 * node 2135-76998) — different crop points than the modal's Collage. */
const MiniCollage = () => (
  <div className="relative h-full w-full overflow-hidden">
    <img
      src={ASSET("trophy.svg")}
      alt=""
      className="pointer-events-none absolute"
      style={{ left: "16.15%", top: "0%", width: "36.93%", height: "110.12%" }}
    />
    <img
      src={ASSET("olise.png")}
      alt=""
      className="pointer-events-none absolute object-cover object-top"
      style={{ left: "23.68%", top: "10.01%", width: "62.74%", height: "109.42%" }}
    />
    <img
      src={ASSET("ronaldo.png")}
      alt=""
      className="pointer-events-none absolute object-cover object-top"
      style={{ left: "33.86%", top: "2.73%", width: "63.08%", height: "223.80%" }}
    />
    <img
      src={ASSET("messi.png")}
      alt=""
      className="pointer-events-none absolute object-cover object-top"
      style={{ left: "-35.09%", top: "14.14%", width: "134.57%", height: "147.26%" }}
    />
  </div>
);

export function PlayPromoBanner() {
  const [dismissed, setDismissed] = useState(() =>
    typeof window === "undefined" ? false : isBannerDismissed(),
  );
  const [ready, setReady] = useState(() => typeof window !== "undefined");

  useEffect(() => {
    setDismissed(isBannerDismissed());
    setReady(true);
  }, []);

  const dismiss = useCallback(() => {
    markBannerDismissed();
    setDismissed(true);
  }, []);

  if (!config.fantasyEnabled || !ready || dismissed) return null;

  return (
    <>
      <motion.div
        // Below the navbar (z-50) so the logo dropdown shows above the banner.
        // Still above page content; dropdowns/modals (z-50+) stay on top.
        className="pointer-events-none fixed left-0 right-0 top-16 z-[30] mt-1 overflow-visible"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss promo banner"
          className="pointer-events-auto absolute right-0.5 top-1/2 z-30 flex size-8 -translate-y-1/2 items-center justify-center text-white/90 transition-colors hover:text-white md:hidden"
        >
          <IoClose className="size-[22px]" strokeWidth={2.5} />
        </button>
        {/* Mobile */}
        <div className="relative h-[65px] md:hidden">
          <div className="absolute inset-0 overflow-hidden bg-lavender-500">
            <BannerBackdrop />
          </div>
          <div className="relative z-20 flex h-full items-center gap-1 pr-[3.25rem] pl-[24%] xsm:gap-1.5 xsm:pr-[3.5rem]">
            <h2 className="ml-1 shrink-0 text-[19px] font-bold leading-[0.76] tracking-[-0.07em] text-black xsm:text-[20px]">
              Predict.
              <br />
              Compete.
              <br />
              Win.
            </h2>
            <p className="ml-0.5 min-w-0 flex-1 -translate-y-0.5 whitespace-nowrap text-[8px] font-normal leading-[1.35] tracking-[-0.02em] text-[#F5F5F5] xsm:ml-1.5 xsm:text-[9px]">
              Build your fantasy squad, earn points
              <br />
              from real World Cup performances,
              <br />
              and win exclusive rewards.
            </p>
          </div>
          <Link
            href="/play"
            onClick={dismiss}
            className="pointer-events-auto absolute right-8 top-1/2 z-30 -translate-y-1/2 shrink-0 rounded-md bg-white px-1.5 py-1.5 text-[8px] font-semibold leading-none text-black transition-colors hover:bg-white/90 xsm:right-9 xsm:px-2 xsm:text-[9px]"
          >
            Join
          </Link>
        </div>

        {/* Desktop — Figma: strip with the collage flush left, popping above */}
        <div className="relative hidden h-[64px] items-center md:flex">
          <div className="absolute inset-0 overflow-hidden bg-lavender-500">
            <BannerBackdrop />
          </div>
          <div className="relative z-20 flex h-full w-full items-center gap-4 pl-[min(210px,16.5vw)] pr-[220px] lg:gap-5 lg:pr-[260px]">
            <h2 className="ml-12 shrink-0 whitespace-nowrap text-[26px] font-bold leading-[0.76] tracking-[-0.07em] text-black lg:ml-24 xl:text-[35px]">
              Predict. Compete. Win.
            </h2>
            <p className="max-w-[26rem] shrink-0 text-[13px] leading-[1.3] text-[#F5F5F5] xl:max-w-[28rem] xl:text-sm">
              Build your fantasy squad, earn points from real World Cup
              performances, climb the leaderboard, and win exclusive rewards.
            </p>
          </div>

          {/* Align with navbar Network + Settings (same container + wallet offset) */}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-30 hidden -translate-y-1/2 md:block">
            <div className="mx-auto flex w-full max-w-screen-2xl justify-end px-4 lg:px-8">
              <div className="flex items-center gap-3 sm:gap-4">
                {/* Skip wallet chip width so actions sit under Network + Settings */}
                <div className="hidden h-9 w-[5.75rem] shrink-0 sm:block" aria-hidden />
                <Link
                  href="/play"
                  onClick={dismiss}
                  className="pointer-events-auto shrink-0 rounded-xl bg-white px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90"
                >
                  Join a league
                </Link>
                <button
                  type="button"
                  onClick={dismiss}
                  aria-label="Dismiss promo banner"
                  className="pointer-events-auto flex size-6 shrink-0 items-center justify-center text-white/90 transition-colors hover:text-white"
                >
                  <IoClose className="size-5" strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Collage on its own fixed layer above the banner strip (z-30) so the trophy
        tip + heads pop over the strip's top edge. Logo dropdown is portaled at
        z-[60] in Navbar so it still appears above this layer. */}
      <div className="pointer-events-none fixed left-0 right-0 top-16 z-30 mt-1 overflow-visible">
        {/* Mobile */}
        <div className="relative h-[65px] md:hidden">
          <div
            className="absolute bottom-0 left-0 w-[26%] min-w-[80px] max-w-[116px] overflow-hidden"
            style={{ top: "-28px" }}
          >
            <div className="absolute inset-0" style={{ transform: "translate(-10px, 22px)" }}>
              <MiniCollage />
            </div>
          </div>
        </div>
        {/* Desktop */}
        <div className="relative hidden h-[64px] md:block">
          <div
            className="absolute bottom-0 left-0 w-[min(240px,18vw)] overflow-hidden"
            style={{ top: "-42px" }}
          >
            <div className="absolute inset-0" style={{ transform: "translateY(22px)" }}>
              <MiniCollage />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Play button — shown in place of the banner once it has been dismissed
// (via the X or "Join a league"). Persists across visits and links to /play.
// ---------------------------------------------------------------------------

export function PlayPromoButton() {
  const bannerVisible = usePlayPromoBannerVisible();

  // Only takes the banner's place: hidden while the banner is showing, and
  // gone entirely once the campaign (fantasy) is switched off.
  if (!config.fantasyEnabled || bannerVisible) return null;

  return (
    <motion.div
      className="pointer-events-none fixed left-0 right-0 top-[72px] z-30"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="mx-auto flex max-w-screen-2xl justify-end px-4 lg:px-8">
        <Link
          href="/play"
          aria-label="Open Noblocks Play"
          className="pointer-events-auto flex h-[34px] items-center gap-1 rounded-[7.31px] border border-icon-outline-secondary px-2.5 text-[11.81px] font-semibold leading-none text-text-body transition-colors hover:bg-accent-gray/50 dark:border-white/50 dark:text-white dark:hover:bg-white/5"
        >
          <NoblocksAnimatedIcon phases={["ball"]} className="size-[18px] shrink-0" />
          Play
          <ArrowDown01Icon
            className="size-4 shrink-0 -rotate-90 text-icon-outline-secondary dark:text-white/50"
            strokeWidth={4}
          />
        </Link>
      </div>
    </motion.div>
  );
}
