"use client";

import { motion, AnimatePresence } from "framer-motion";
import { VoiceStatus } from "@/store/useAppStore";

interface VoiceOrbProps {
  status: VoiceStatus;
}

const statusLabel: Record<VoiceStatus, string> = {
  idle: "시작하기",
  connecting: "연결 중...",
  listening: "듣고 있어요",
  speaking: "말하는 중",
  processing: "생각 중...",
  ended: "종료됨",
};

const statusColor: Record<VoiceStatus, string> = {
  idle: "#C4B5FD",
  connecting: "#A78BFA",
  listening: "#7C5CFC",
  speaking: "#6D28D9",
  processing: "#8B5CF6",
  ended: "#D1D5DB",
};

export default function VoiceOrb({ status }: VoiceOrbProps) {
  const color = statusColor[status];
  const isActive = status === "listening" || status === "speaking";
  const isProcessing = status === "processing";

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6">
      <div className="relative flex items-center justify-center w-56 h-56">
        {/* 가장 바깥 pulse 링 */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              key="ring-outer"
              className="absolute rounded-full"
              style={{ backgroundColor: `${color}20` }}
              initial={{ width: 160, height: 160, opacity: 0.6 }}
              animate={{
                width: [160, 220, 160],
                height: [160, 220, 160],
                opacity: [0.6, 0, 0.6],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </AnimatePresence>

        {/* 중간 링 */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              key="ring-mid"
              className="absolute rounded-full"
              style={{ backgroundColor: `${color}35` }}
              initial={{ width: 140, height: 140, opacity: 0.7 }}
              animate={{
                width: [140, 190, 140],
                height: [140, 190, 140],
                opacity: [0.7, 0.2, 0.7],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.3,
              }}
            />
          )}
        </AnimatePresence>

        {/* 메인 원 */}
        <motion.div
          className="relative z-10 flex items-center justify-center rounded-full shadow-lg"
          style={{ backgroundColor: color }}
          animate={
            isProcessing
              ? { scale: [1, 1.05, 1], opacity: [1, 0.8, 1] }
              : isActive
              ? { scale: [1, 1.03, 1] }
              : { scale: 1 }
          }
          transition={
            isProcessing || isActive
              ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
              : {}
          }
          initial={{ width: 120, height: 120 }}
          whileTap={{ scale: 0.96 }}
        >
          <motion.div
            className="w-[120px] h-[120px] rounded-full flex items-center justify-center"
          >
            {/* 상태 라벨 pill */}
            <motion.div
              className="px-4 py-2 rounded-full flex items-center gap-2"
              style={{ backgroundColor: "rgba(255,255,255,0.25)" }}
              layout
            >
              {(isProcessing || status === "connecting") && (
                <motion.div
                  className="flex gap-1"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                >
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-white"
                      animate={{ y: [0, -4, 0] }}
                      transition={{
                        duration: 0.6,
                        repeat: Infinity,
                        delay: i * 0.15,
                      }}
                    />
                  ))}
                </motion.div>
              )}
              <span className="text-white text-sm font-medium whitespace-nowrap">
                {statusLabel[status]}
              </span>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
