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
  searchHeight: 65,
  // Half the default height is visually identical to the existing pill token.
  searchRadius: 35,
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
