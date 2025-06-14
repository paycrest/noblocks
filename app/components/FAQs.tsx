import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crimson_Pro } from "next/font/google";
const crimsonPro = Crimson_Pro({
  subsets: ["latin"],
  weight: ["400", "600"], // adjust weights as needed
  variable: "--font-crimson",
});

const faqs = [
  {
    question: "What is Noblocks?",
    answer:
      "Noblocks is a decentralized liquidity platform that lets you instantly swap stablecoins for cash, directly to your bank or mobile money account, with no crypto experience required.",
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
      className="flex h-5 w-5 items-center justify-center"
    >
      {open ? (
        // Minus icon
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
            fill="black"
            stroke="black"
            strokeWidth="2.2"
          />
        </svg>
      ) : (
        // Plus icon
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
            fill="black"
            stroke="black"
            strokeWidth="2.2"
          />
          <rect
            x="7"
            y="3"
            width="2"
            height="10"
            rx="1"
            fill="black"
            stroke="black"
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
          `flex w-full items-center gap-4 rounded-tl-2xl rounded-tr-2xl border-[#FFFFFF1A] bg-[#FFFFFF0D] p-2 py-4 text-left focus:outline-none` +
          (!isOpen ? " rounded-bl-xl rounded-br-xl" : "")
        }
        onClick={onClick}
        aria-expanded={isOpen}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#32DBC6] font-bold text-black">
          <PlusMinusIcon open={isOpen} />
        </span>
        <span className="text-lg font-medium text-[#FFFFFF80]">{question}</span>
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
            <div className="rounded-bl-xl rounded-br-xl border-b border-l border-r border-[#FFFFFF1A] px-4 py-2 text-base text-[#FFFFFF80]">
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
    <section className="mx-auto my-8 flex w-full max-w-[999px] flex-col gap-3 lg:grid lg:grid-cols-[1fr_2fr] lg:items-center">
      <h2
        className={`${crimsonPro.className} flex gap-3 text-center text-2xl justify-center font-semibold lg:max-w-[294px] lg:flex-col lg:items-start lg:text-left lg:text-[56px]`}
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
