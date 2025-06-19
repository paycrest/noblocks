"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crimson_Pro } from "next/font/google";
const crimsonPro = Crimson_Pro({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-crimson",
});

const faqs = [
  {
    question: "What is Noblocks?",
    answer:
      "Noblocks.xyz is a decentralized liquidity app developed by Paycrest, designed to facilitate instant crypto-to-fiat exchanges and payments. It supports mobile money and bank settlements across multiple regions, including Kenyan Shillings (KES), Ghanaian Cedis (GHS), and Nigerian Naira (NGN).\.",
  },
  {
    question: "Who is noblocks for?",
    answer:
      "Noblocks is for anyone who wants to move money across borders, cash out stablecoins, or access local currency quickly—whether you're a crypto native, freelancer, business, or just getting started.",
  },
  {
    question: "How does noblocks work?",
    answer:
      "You send stablecoins (like USDC or USDT) to Noblocks, and we instantly convert and settle the equivalent cash to your chosen bank or mobile money account at the best available rate.",
  },
  {
    question: "Who is a provider?",
    answer:
      "Noblocks.xyz is a decentralized liquidity app developed by PayCrest, designed to facilitate instant crypto-to-fiat exchanges and payments. It supports mobile money and bank settlements across multiple regions, including Kenyan Shillings (KES), Ghanaian Cedis (GHS), and Nigerian Naira (NGN).",
  },
];

function PlusMinusIcon({ open }: { open: boolean }) {
  return (
    <motion.span
      animate={{ rotate: open ? 180 : 0 }}
      transition={{ duration: 0.2 }}
      className="flex h-5 w-5 items-center justify-center text-white dark:text-black"
    >
      {open ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="mx-auto block"
          style={{ display: "block" }}
        >
          <rect
            x="3"
            y="7"
            width="10"
            height="2"
            rx="1"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="2.2"
          />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="mx-auto block"
          style={{ display: "block" }}
        >
          <rect
            x="3"
            y="7"
            width="10"
            height="2"
            rx="1"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="2.2"
          />
          <rect
            x="7"
            y="3"
            width="2"
            height="10"
            rx="1"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="2.2"
          />
        </svg>
      )}
    </motion.span>
  );
}

function AccordionItem({
  question,
  answer,
  isOpen,
  onClick,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <div>
      <button
        className={
          `flex w-full items-center gap-4 rounded-tl-2xl rounded-tr-2xl border-[#EBEBEF] bg-[#F9FAFB] p-2 py-4 text-left focus:outline-none dark:border-[#FFFFFF1A] dark:bg-[#FFFFFF0D]` +
          (!isOpen ? " rounded-bl-xl rounded-br-xl" : "")
        }
        onClick={onClick}
        aria-expanded={isOpen}
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full font-bold text-black ${isOpen ? "bg-[#CC3681]" : "bg-[#20BA90]"}`}
        >
          <PlusMinusIcon open={isOpen} />
        </span>
        <span className="text-lg font-medium text-black dark:text-[#FFFFFF80]">
          {question}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial="collapsed"
            animate="open"
            exit="collapsed"
            variants={{
              open: { height: "auto", opacity: 1 },
              collapsed: { height: 0, opacity: 0 },
            }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="rounded-bl-xl rounded-br-xl border-b border-l border-r border-[#FFFFFF1A] px-4 py-2 text-base text-black dark:text-[#FFFFFF80]">
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FAQs() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="mx-auto mb-[185px] flex w-full max-w-[999px] flex-col gap-4 px-5 lg:grid lg:grid-cols-[1fr_2fr] lg:items-center">
      <h2
        className={`${crimsonPro.className} flex justify-center gap-4 text-center text-2xl font-semibold lg:max-w-[294px] lg:flex-col lg:items-start lg:text-left lg:text-[56px]`}
      >
        <span>Frequently</span>
        <span>Asked</span>
        <span>Questions</span>
      </h2>
      <div className="flex flex-col gap-4">
        {faqs.map((faq, idx) => (
          <AccordionItem
            key={faq.question}
            question={faq.question}
            answer={faq.answer}
            isOpen={openIndex === idx}
            onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
          />
        ))}
      </div>
    </section>
  );
}
