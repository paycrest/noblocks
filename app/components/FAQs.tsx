"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crimson_Pro } from "next/font/google";
import { FaMinus, FaPlus } from "react-icons/fa6";

const crimsonPro = Crimson_Pro({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  variable: "--font-crimson",
});

const faqs = [
  {
    question: "What is Noblocks?",
    answer:
      "Noblocks is an intuitive interface for moving between stablecoins and local currency. You can cash out stablecoins to bank or mobile money, or buy stablecoins with fiat—powered by Paycrest's decentralized liquidity network across multiple regions, including Kenya (KES), Uganda (UGX), Nigeria (NGN), Tanzania (TZS), and more.",
  },
  {
    question: "Who is Noblocks for?",
    answer:
      "Noblocks is for anyone who needs to move money across borders: cash out stablecoins, buy stablecoins with local currency, or get paid in fiat quickly—whether you're a crypto-native user, freelancer, business, or new to digital payments.",
  },
  {
    question: "How does Noblocks work?",
    answer:
      "Stablecoin → fiat: Connect your wallet, choose the token and amount you want to sell, pick the fiat currency and add your recipient or bank details, then review the rate and confirm. Your stablecoins are converted and the local currency is sent to your chosen account.\n\nFiat → stablecoin: Switch to on-ramp, enter how much fiat you want to send and which stablecoin you want to receive, then follow the payment instructions for your bank or mobile money transfer. When your payment is confirmed, stablecoins are credited to your connected wallet.\n\nRates are shown before you confirm, and many flows use sponsored transactions so you don't pay gas in the app.",
  },
  {
    question: "How do I buy stablecoins with a bank or mobile money transfer?",
    answer:
      'On the home screen, switch to on-ramp ("change cash to stablecoins"). Select the asset you want to receive, enter your fiat amount, and complete any verification required. You\'ll get payment instructions for your bank or mobile money transfer. Send the payment; once it\'s received and the order completes, stablecoins are delivered to your Noblocks wallet. You can track the order from your transaction history.',
  },
  {
    question: "Who is a provider?",
    answer:
      "Providers are entities in Paycrest's decentralized network who facilitate stablecoin-fiat settlements. They run provision nodes that connect with local payment service providers, enabling instant collection and payouts of stablecoins to bank accounts and mobile money across different countries.",
  },
];

function PlusMinusIcon({ open }: { open: boolean }) {
  return (
    <span className="flex h-5 w-5 items-center justify-center text-white dark:text-black">
      {open ? <FaMinus size={16} /> : <FaPlus size={16} />}
    </span>
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
        type="button"
        className={
          `flex w-full items-center gap-4 rounded-tl-2xl rounded-tr-2xl border-[#EBEBEF] bg-[#F9FAFB] p-4 text-left focus:outline-none dark:border-[#FFFFFF1A] dark:bg-[#FFFFFF0D]` +
          (!isOpen ? " rounded-bl-xl rounded-br-xl" : "")
        }
        onClick={onClick}
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full font-bold text-black ${isOpen ? "bg-[#CC3681]" : "bg-[#20BA90]"}`}
        >
          <PlusMinusIcon open={isOpen} />
        </span>
        <span className="text-base font-medium text-black dark:text-[#FFFFFF80]">
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
            <div className="whitespace-pre-line rounded-bl-xl rounded-br-xl border-b border-l border-r border-[#FFFFFF1A] px-4 py-2 text-base font-normal leading-6 text-black dark:text-[#FFFFFF80]">
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
    <section className="mx-auto mb-[5.3125rem] flex w-full max-w-[999px] flex-col gap-6 px-5 lg:mb-[17.75rem] lg:grid lg:grid-cols-[1fr_2fr]">
      <h2
        className={`${crimsonPro.className} flex flex-wrap gap-1 text-center text-[2rem] font-semibold italic sm:gap-2 sm:text-[2.95rem] md:text-6xl lg:max-w-[294px] lg:flex-col lg:items-start lg:gap-5 lg:text-left lg:leading-[0.9]`}
      >
        <span>Frequently </span>
        <span>Asked </span>
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
