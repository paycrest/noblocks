"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { primaryBtnClasses, secondaryBtnClasses } from "./components";
import { classNames } from "./utils";

export default function NotFound() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="text-center"
    >
      {/* 404 Number */}
      <motion.h1
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.6, type: "spring" }}
        className="mb-4 text-9xl font-medium text-lavender-500"
      >
        404
      </motion.h1>

      {/* Error Message */}
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="mb-4 text-2xl font-semibold text-text-body dark:text-white"
      >
        Page Not Found
      </motion.h2>

      {/* Description */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="mx-auto mb-8 max-w-md text-sm text-text-secondary dark:text-white/50"
      >
        The page you&apos;re looking for doesn&apos;t exist or has been moved to
        a different location.
      </motion.p>

      {/* Action Buttons */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.6 }}
        className="flex flex-col items-center gap-4 text-sm sm:flex-row sm:justify-center"
      >
        <Link href="/" className={classNames(primaryBtnClasses)}>
          Go Back Home
        </Link>

        <Link href="/blog" className={classNames(secondaryBtnClasses)}>
          Visit Blog
        </Link>
      </motion.div>

      {/* Decorative Elements */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.1 }}
        transition={{ delay: 0.8, duration: 1 }}
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute left-1/4 top-1/4 h-32 w-32 rounded-full bg-lavender-400 opacity-20 blur-3xl dark:opacity-10"></div>
        <div className="absolute bottom-1/4 right-1/4 h-24 w-24 rounded-full bg-purple-400 opacity-20 blur-3xl dark:opacity-10"></div>
      </motion.div>
    </motion.div>
  );
}
