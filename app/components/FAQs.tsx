import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const faqs = [
  {
    question: "What is Noblocks?",
    answer:
      "Noblocks is a platform that allows you to swap stablecoins for cash instantly, with the best rates and no crypto experience required.",
  },
  {
    question: "Do I need a crypto wallet?",
    answer:
      "No! You can use Noblocks without any prior crypto experience. We support both crypto-native and non-crypto users.",
  },
  {
    question: "How fast are transactions?",
    answer:
      "Most swaps complete in under 30 seconds, making it one of the fastest ways to move from stablecoins to cash.",
  },
  {
    question: "Is Noblocks safe?",
    answer:
      "Yes, Noblocks uses secure smart contracts and industry best practices to keep your funds safe.",
  },
];

function PlusMinusIcon({ open }: { open: boolean }) {
  return (
    <motion.span
      animate={{ rotate: open ? 180 : 0 }}
      transition={{ duration: 0.2 }}
      className="ml-2 flex h-6 w-6 items-center justify-center"
    >
      {open ? (
        // Minus icon
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect
            x="4"
            y="9"
            width="12"
            height="2"
            rx="1"
            fill="black"
            stroke="black"
            strokeWidth="2"
          />
        </svg>
      ) : (
        // Plus icon
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect
            x="4"
            y="9"
            width="12"
            height="2"
            rx="1"
            fill="black"
            stroke="black"
            strokeWidth=""
          />
          <rect
            x="9"
            y="4"
            width="2"
            height="12"
            rx="1"
            fill="black"
            stroke="black"
            strokeWidth="2"
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
    <div className="">
      <button
        className="flex w-full items-center rounded-2xl bg-[#FFFFFF0D] py-4 text-left focus:outline-none"
        onClick={onClick}
        aria-expanded={isOpen}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#32DBC6] font-bold text-black">
          <PlusMinusIcon open={isOpen} />
        </span>
        <span className="text-lg font-medium text-white">{question}</span>
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
            <div className="py-2 text-base text-white/80">{answer}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FAQs() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="mx-auto flex w-full max-w-[999px] flex-col gap-3">
      <h2 className="mb-6 text-center text-2xl font-semibold text-white">
        Frequently Asked Questions
      </h2>
      <div className="divide-y divide-[#FFFFFF1A]">
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
