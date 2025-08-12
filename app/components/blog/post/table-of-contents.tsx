"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";
import config from "@/app/lib/config";

interface Section {
  id: string;
  title: string;
}

interface TableOfContentsProps {
  sections: Section[];
}

const TableOfContents: React.FC<TableOfContentsProps> = ({ sections }) => {
  const [activeSection, setActiveSection] = useState<string>("");
  const [isScrolling, setIsScrolling] = useState(false);

  // Ensure sections have valid structure
  const validSections = sections.filter(
    (section) => section && section.id && section.title,
  );

  useEffect(() => {
    const handleScroll = () => {
      // Don't update active section if we're in the middle of a programmatic scroll
      if (isScrolling) {
        return;
      }

      const headings = validSections
        .map((section) => document.getElementById(section.id))
        .filter(Boolean);

      if (headings.length === 0) {
        return;
      }

      // Match the scroll-mt-32 (128px) offset when banner is present, otherwise scroll-mt-20 (80px)
      const scrollOffset = config.noticeBannerText ? 128 : 80;
      const scrollPosition = window.scrollY + scrollOffset;

      // Find the current active section
      let currentSection = "";
      for (let i = headings.length - 1; i >= 0; i--) {
        const heading = headings[i];
        if (heading && heading.offsetTop <= scrollPosition) {
          currentSection = heading.id;
          break;
        }
      }

      if (currentSection !== activeSection) {
        setActiveSection(currentSection);
      }
    };

    // Add scroll listener with a small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      window.addEventListener("scroll", handleScroll);
      handleScroll(); // Initial check
    }, 500); // Increased delay to ensure DOM is fully ready

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [validSections]);

  const handleClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    sectionId: string,
  ) => {
    e.preventDefault();

    // Try to find the element, with a small retry mechanism
    const findElement = () => {
      const element = document.getElementById(sectionId);
      if (element) {
        // Account for the navbar height (64px) plus banner height (56px) plus some padding
        const navbarHeight = 64;
        const bannerHeight = 56; // min-h-14 = 56px
        const hasBanner = !!config.noticeBannerText;
        const totalOffset = navbarHeight + (hasBanner ? bannerHeight : 0) + 16; // 16px additional padding

        const elementPosition = element.offsetTop - totalOffset;

        // Set scrolling state to prevent scroll handler interference
        setIsScrolling(true);

        // Use scrollTo with smooth behavior
        window.scrollTo({
          top: elementPosition,
          behavior: "smooth",
        });

        // Reset scrolling state and update active section after animation completes
        setTimeout(() => {
          setIsScrolling(false);

          // Manually trigger scroll handler to update active section
          const headings = validSections
            .map((section) => document.getElementById(section.id))
            .filter(Boolean);

          if (headings.length > 0) {
            const scrollOffset = config.noticeBannerText ? 128 : 80;
            const scrollPosition = window.scrollY + scrollOffset;

            // Find the current active section
            let currentSection = "";
            for (let i = headings.length - 1; i >= 0; i--) {
              const heading = headings[i];
              if (heading && heading.offsetTop <= scrollPosition) {
                currentSection = heading.id;
                break;
              }
            }

            setActiveSection(currentSection);
          }
        }, 1000);
      } else {
        // Retry once after a short delay in case DOM is still loading
        setTimeout(() => {
          const retryElement = document.getElementById(sectionId);
          if (retryElement) {
            const navbarHeight = 64;
            const bannerHeight = 56;
            const hasBanner = !!config.noticeBannerText;
            const totalOffset =
              navbarHeight + (hasBanner ? bannerHeight : 0) + 16;
            const elementPosition = retryElement.offsetTop - totalOffset;

            // Set scrolling state to prevent scroll handler interference
            setIsScrolling(true);

            // Use scrollTo with smooth behavior
            window.scrollTo({
              top: elementPosition,
              behavior: "smooth",
            });

            // Reset scrolling state and update active section after animation completes
            setTimeout(() => {
              setIsScrolling(false);

              // Manually trigger scroll handler to update active section
              const headings = validSections
                .map((section) => document.getElementById(section.id))
                .filter(Boolean);

              if (headings.length > 0) {
                const scrollOffset = config.noticeBannerText ? 128 : 80;
                const scrollPosition = window.scrollY + scrollOffset;

                // Find the current active section
                let currentSection = "";
                for (let i = headings.length - 1; i >= 0; i--) {
                  const heading = headings[i];
                  if (heading && heading.offsetTop <= scrollPosition) {
                    currentSection = heading.id;
                    break;
                  }
                }

                setActiveSection(currentSection);
              }
            }, 1000);
          }
        }, 500);
      }
    };

    findElement();
  };

  if (!validSections.length) return null;

  return (
    <motion.nav
      aria-label="Jump to sections"
      className="space-y-5"
      variants={fadeBlur}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <h2 className="text-xs font-medium text-white">Jump to</h2>
      <div className="relative pl-4">
        <div className="absolute bottom-0 left-0 top-0 h-full w-px bg-white/10" />
        <ul className="space-y-1 text-xs text-white/50">
          {validSections.map((section) => (
            <li key={section.id} className="relative">
              <a
                href={`#${section.id}`}
                onClick={(e) => handleClick(e, section.id)}
                className={`relative block cursor-pointer rounded px-2 py-2 transition ${
                  activeSection === section.id
                    ? "text-white"
                    : "hover:text-white/80"
                } `}
              >
                {activeSection === section.id && (
                  <span className="absolute left-[-16px] top-1/2 h-8 w-px -translate-y-1/2 rounded bg-white" />
                )}
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </motion.nav>
  );
};

export default TableOfContents;
