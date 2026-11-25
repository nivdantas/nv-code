import { create } from "zustand";

export const useScreenshotModeStore = create<{ active: boolean }>(() => ({ active: false }));
