"use client";
import { useReducedMotion as useFM } from "framer-motion";
export function useReducedMotionPref(): boolean {
  return useFM() ?? false;
}
