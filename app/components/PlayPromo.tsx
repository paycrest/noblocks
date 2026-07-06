"use client";

/**
 * Noblocks Play promo — homepage-only modal + banner (Figma:
 * node 2135-87421 modal, node 2135-79717 banner). Assets are the exact
 * exports from the design (public/images/play-promo/).
 *
 * Modal: shown once per visitor (dismiss = never again, via localStorage),
 * fixed to the mobile design size on every breakpoint.
 * Banner: persistent under the navbar for as long as Noblocks Play is
 * enabled (config.fantasyEnabled) — same signal that turns /play off after
 * the campaign ends, so it disappears automatically then.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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
  <>
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
  </>
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
  <>
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
  </>
);

// ---------------------------------------------------------------------------
// Dismiss-forever modal
// ---------------------------------------------------------------------------

const MODAL_STORAGE_KEY = "noblocks_play_promo_dismissed";

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
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!config.fantasyEnabled) return;
    if (isModalDismissed()) return;
    // Small delay so it doesn't flash on initial page load.
    const timer = setTimeout(() => setIsOpen(true), 500);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = useCallback(() => {
    markModalDismissed();
    setIsOpen(false);
  }, []);

  if (!config.fantasyEnabled) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onClose={dismiss} className="relative z-[70]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            aria-hidden="true"
          />

          <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <DialogPanel>
                {/* Fixed to the mobile design size on every breakpoint — the
                    promo is intentionally not "responsive" here. */}
                <div
                  className="relative overflow-hidden rounded-[28px] bg-lavender-500 shadow-2xl w-[315px] h-[393px] md:w-[450px] md:h-[560px]"
                  style={{ containerType: "inline-size" }}
                >
                  <ModalBackdrop />
                  <Collage />

                  {/* The FIFA World Cup emblem in the design is licensed and
                      can't ship here — swapped for our own animated mark,
                      cycling ball/trophy only (no "n" — this spot shouldn't
                      show the Noblocks brand icon). */}
                  <div
                    className="absolute flex items-center justify-center"
                    style={{ left: "5.99%", top: "5.52%", width: "13.71%", height: "11.13%" }}
                  >
                    <NoblocksAnimatedIcon phases={["ball", "trophy"]} className="size-[32px]" />
                  </div>

                  <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Dismiss"
                    className="absolute flex items-center justify-center rounded-full border border-white/30 bg-white/30 backdrop-blur-sm transition-colors hover:bg-white/40"
                    style={{ left: "88.23%", top: "4.19%", width: "8.54%", height: "6.91%" }}
                  >
                    <img src={ASSET("close-icon.svg")} alt="" className="h-1/2 w-1/2" />
                  </button>

                  {/* Font sizes/tracking are in cqw (container-query width),
                      scaled from the exact design px values at the 318px
                      reference card, so they stay pixel-accurate whether the
                      card renders at 318px or the 450px desktop size above. */}
                  <h2
                    className="absolute font-bold text-[#F5F5F5]"
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
                    className="absolute text-[#F5F5F5]"
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
                    className="absolute flex items-center justify-center rounded-full bg-white font-semibold text-black transition-transform active:scale-[0.98]"
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
              </DialogPanel>
            </motion.div>
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
      className="pointer-events-none absolute object-cover"
      style={{ left: "23.68%", top: "10.01%", width: "62.74%", height: "109.42%" }}
    />
    <img
      src={ASSET("ronaldo.png")}
      alt=""
      className="pointer-events-none absolute object-cover"
      style={{ left: "33.86%", top: "2.73%", width: "63.08%", height: "223.80%" }}
    />
    <img
      src={ASSET("messi.png")}
      alt=""
      className="pointer-events-none absolute object-cover"
      style={{ left: "-35.09%", top: "14.14%", width: "134.57%", height: "147.26%" }}
    />
  </div>
);

export function PlayPromoBanner() {
  if (!config.fantasyEnabled) return null;

  return (
    <motion.div
      className="fixed left-0 right-0 top-16 z-30 mt-1 overflow-hidden bg-lavender-500"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <BannerBackdrop />

      {/* Mobile: pixel-exact recreation of the Figma banner (375px-wide
          reference strip, node 2135-79717). Font sizes/tracking are in cqw
          so they stay accurate across real device widths near the 375px
          reference. */}
      <div
        className="relative h-[65px] md:hidden"
        style={{ containerType: "inline-size" }}
      >
        <div
          className="absolute"
          style={{ left: "0.18%", top: "-5.36%", width: "22.24%", height: "134.68%" }}
        >
          <MiniCollage />
        </div>

        <div
          className="absolute"
          style={{ left: "25.0656%", top: "10.9111%", width: "74.6287%", height: "78.3714%" }}
        >
          <h2
            className="absolute font-bold text-black leading-[0.95]"
            style={{
              left: "0%",
              top: "0%",
              width: "28.32%",
              height: "100%",
              fontSize: "4.656cqw",
              letterSpacing: "-0.3259cqw",
            }}
          >
            Predict. Compete. Win.
          </h2>
          <p
            className="absolute text-[#F5F5F5]"
            style={{
              left: "30.54%",
              top: "19.23%",
              width: "42.68%",
              height: "61.54%",
              fontSize: "1.498cqw",
              lineHeight: 1.351,
              letterSpacing: "-0.0299cqw",
            }}
          >
            Build your fantasy squad, earn points from real World Cup
            performances, climb the leaderboard, and win exclusive rewards.
          </p>
          <Link
            href="/play"
            className="absolute flex items-center justify-center rounded-md bg-white font-semibold text-black"
            style={{
              left: "77.44%",
              top: "23.32%",
              width: "20.56%",
              height: "53.36%",
              fontSize: "1.789cqw",
            }}
          >
            Join the league
          </Link>
        </div>
      </div>

      {/* Desktop: adapted layout — no desktop frame exists in the design, so
          this is a reinterpretation (larger thumbnail, roomier text/button)
          rather than a pixel clone. */}
      <div className="relative hidden h-20 md:flex">
        <div
          className="absolute scale-[0.65]"
          style={{ left: "-0.28%", top: "-60.36%", width: "22.24%", height: "334.68%" }}
        >
          <MiniCollage />
        </div>

        {/* Explicit height (not fit-content): every child here is absolute
            (out of flow), so a fit-content parent collapses to zero and any
            child using height:"100%" would resolve against that zero. */}
        <div
          className="absolute"
          style={{ left: "25.0656%", top: "0%", width: "74.6287%", height: "100%" }}
        >
          <h2
            className="absolute flex items-center font-bold text-black leading-[0.95]"
            style={{
              left: "-7%",
              top: "0%",
              width: "48.32%",
              height: "100%",
              fontSize: "1.156cqw",
              letterSpacing: "-0.1259cqw",
            }}
          >
            Predict. Compete. Win.
          </h2>
          <p
            className="absolute flex items-center text-[#F5F5F5]"
            style={{
              left: "35.54%",
              top: "0%",
              width: "32.68%",
              height: "100%",
              fontSize: "0.798cqw",
              lineHeight: 0.951,
              letterSpacing: "-0.0299cqw",
            }}
          >
            Build your fantasy squad, earn points from real World Cup
            performances, climb the leaderboard, and win exclusive rewards.
          </p>
          <Link
            href="/play"
            className="absolute flex items-center justify-center rounded-xl px-4 py-4 bg-white hover:bg-white/90  font-semibold text-black transition-transform"
            style={{
              left: "82.44%",
              top: "50%",
              width: "fit-content",
              height: "57%",
              transform: "translateY(-50%)",
              fontSize: "0.79cqw",
            }}
          >
            Join the league
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
