import { createContext, useContext, type PropsWithChildren } from 'react';

export type HomeDesignSettings = {
  heroFontSize: number;
  screenPadding: number;
  sectionGap: number;
  searchHeight: number;
  searchRadius: number;
  ctaHeight: number;
  ctaRadius: number;
  // 2026-09-17: `jobCardRadius` is gone. It rounded `OpenJobCard`, the card the
  // Nearby list drew on the customer Home, and Nearby left that screen — so the
  // setting had no reader and its slider moved nothing. The customer's own
  // postings draw components/HubCard.tsx, which carries its own corner.
};

/** Defaults are visually identical to the approved Customer Home. */
export const DEFAULT_HOME_DESIGN_SETTINGS: HomeDesignSettings = {
  // home(23): 30 -> 31, against the REPLACED master 44. See MASTER_SERIF_CAPS
  // in screens/HomeScreen.tsx: the new file's T measures a 24.03pt cap, which
  // is 35pt of Georgia, and the artwork's ink caps the column at 31. This is
  // the studio's DEFAULT, not a frozen value: the slider still runs 28..56.
  heroFontSize: 33,
  screenPadding: 20,
  sectionGap: 20,
  // 2026-09-18: 65 -> 44 and 35 -> 17 — the search field moved INSIDE the
  // task card under its title (docs/mockups/html/home-redesign.html `.field`:
  // height 44, radius 17), where the standalone 65pt pill would have been a
  // second card inside the card. 44 is CLAUDE.md's touch floor exactly, and
  // the studio's slider still runs from it. The radius is no longer half the
  // height, and 17 is emeraldRadius.lg — a corner, not a capsule.
  searchHeight: 44,
  searchRadius: 17,
  ctaHeight: 48,
  ctaRadius: 24,
};

const HomeDesignStudioContext = createContext<HomeDesignSettings>(DEFAULT_HOME_DESIGN_SETTINGS);

export function HomeDesignStudioProvider({
  settings,
  children,
}: PropsWithChildren<{ settings: HomeDesignSettings }>) {
  return (
    <HomeDesignStudioContext.Provider value={settings}>{children}</HomeDesignStudioContext.Provider>
  );
}

export function useHomeDesignSettings() {
  return useContext(HomeDesignStudioContext);
}
