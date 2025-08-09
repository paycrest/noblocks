"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

interface Section {
  id: string;
  title: string;
}

interface TableOfContentsProps {
  sections: Section[];
}

const TableOfContents: React.FC<TableOfContentsProps> = ({ sections }) => {
  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    const handleScroll = () => {
      const headings = sections
        .map((section) => document.getElementById(section.id))
        .filter(Boolean);

      if (headings.length === 0) {
        return;
      }

      // Match the scroll-mt-20 (80px) offset used in the headings
      const scrollPosition = window.scrollY + 80;

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
    };

    // Add scroll listener with a small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      window.addEventListener("scroll", handleScroll);
      handleScroll(); // Initial check
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [sections]);

  const handleClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    sectionId: string,
  ) => {
    e.preventDefault();

    // Try to find the element, with a small retry mechanism
    const findElement = () => {
      const element = document.getElementById(sectionId);
      if (element) {
        // Account for the navbar height (64px) plus some padding
        const navbarHeight = 64;
        const offset = navbarHeight + 16; // 16px additional padding

        const elementPosition = element.offsetTop - offset;

        window.scrollTo({
          top: elementPosition,
          behavior: "smooth",
        });
      } else {
        // Retry once after a short delay in case DOM is still loading
        setTimeout(() => {
          const retryElement = document.getElementById(sectionId);
          if (retryElement) {
            const navbarHeight = 64;
            const offset = navbarHeight + 16;
            const elementPosition = retryElement.offsetTop - offset;

            window.scrollTo({
              top: elementPosition,
              behavior: "smooth",
            });
          }
        }, 100);
      }
    };

    findElement();
  };

  if (!sections.length) return null;

  return (
    <motion.nav
      aria-label="Jump to sections"
      className="space-y-5"
      variants={fadeBlur}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <h2 className="text-xs font-medium text-gray-900 dark:text-white">
        Jump to
      </h2>
      <div className="relative pl-4">
        <div className="absolute bottom-0 left-0 top-0 h-full w-px bg-gray-300 dark:bg-white/10" />
        <ul className="space-y-1 text-xs text-text-secondary dark:text-white/50">
          {sections.map((section) => (
            <li key={section.id} className="relative">
              <a
                href={`#${section.id}`}
                onClick={(e) => handleClick(e, section.id)}
                className={`relative block cursor-pointer rounded px-2 py-2 transition ${
                  activeSection === section.id
                    ? "text-gray-900 dark:text-white"
                    : "hover:text-gray-700 dark:hover:text-white/80"
                } `}
              >
                {activeSection === section.id && (
                  <span className="absolute left-[-16px] top-1/2 h-8 w-px -translate-y-1/2 rounded bg-lavender-500 dark:bg-white" />
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
