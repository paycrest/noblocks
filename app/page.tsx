"use client";
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";

import {
  AnimatedComponent,
  AnimatedPage,
  fadeInOut,
  Footer,
  Navbar,
  Preloader,
  Success,
  Waitlist,
} from "./components";
import { HeroAnimation } from "./components/HeroAnimation";

export default function Home() {
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    setIsPageLoading(false);
  }, []);

  return (
    <AnimatedPage componentKey="home">
      <Preloader isLoading={isPageLoading} />

      <div className="w-full transition-colors bg-white dark:bg-neutral-900">
        <div className="max-w-screen-2xl mx-auto px-4 lg:pl-16 lg:pr-0 flex justify-between gap-10">
          <div className="relative flex max-w-md mx-auto lg:mx-0 flex-col gap-10 min-h-screen flex-1">
            <Navbar />

            <main className="w-full flex-grow space-y-4">
              <AnimatePresence mode="wait">
                {isSubmitted ? (
                  <AnimatedPage componentKey="success" className="space-y-4">
                    <Success onDone={() => setIsSubmitted(false)} />
                  </AnimatedPage>
                ) : (
                  <AnimatedPage componentKey="waitlist" className="space-y-4">
                    <Waitlist
                      isModalOpen={isModalOpen}
                      setIsModalOpen={setIsModalOpen}
                      setIsSubmitted={setIsSubmitted}
                    />
                  </AnimatedPage>
                )}
              </AnimatePresence>
            </main>

            <Footer />
          </div>

          <AnimatedComponent
            variant={fadeInOut}
            delay={1.5}
            className="w-full max-w-xl h-screen flex-1 hidden lg:block sticky top-0 right-0"
          >
            <HeroAnimation />
          </AnimatedComponent>
        </div>
      </div>
    </AnimatedPage>
  );
}
