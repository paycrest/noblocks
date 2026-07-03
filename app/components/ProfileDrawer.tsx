"use client";
import { Dialog } from "@headlessui/react";
import { motion, AnimatePresence } from "framer-motion";
import { sidebarAnimation } from "./AnimatedComponents";
import ProfileView from "./ProfileView";

interface ProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileDrawer({ isOpen, onClose }: ProfileDrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog
          as="div"
          className="fixed inset-0 z-50 overflow-hidden"
          onClose={onClose}
          open={isOpen}
        >
          <div className="flex h-full">
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm"
              onClick={onClose}
            />

            {/* Drawer content */}
            <motion.div
              {...sidebarAnimation}
              className="z-50 my-4 ml-auto mr-4 flex h-[calc(100%-32px)] w-full max-w-[396px] flex-col overflow-hidden rounded-[20px] border border-border-light bg-white shadow-lg dark:border-white/5 dark:bg-surface-overlay"
            >
              <ProfileView layout="drawer" onClose={onClose} />
            </motion.div>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
