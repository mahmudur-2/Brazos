import { createContext, useContext, type PropsWithChildren } from 'react';

export type HomeDesignSettings = {
  heroFontSize: number;
  screenPadding: number;
  sectionGap: number;
  searchHeight: number;
  searchRadius: number;
  ctaHeight: number;
  ctaRadius: number;
  jobCardRadius: number;
};

/** Defaults are visually identical to the approved Customer Home. */
export const DEFAULT_HOME_DESIGN_SETTINGS: HomeDesignSettings = {
  // home(16): 39 -> 30. See MASTER_SERIF_CAPS in screens/HomeScreen.tsx for
  // where 30 comes from — master 44's cap height puts it at 33, and the column
  // the hero artwork leaves caps it at 30. This is the studio's DEFAULT, not a
  // frozen value: the slider still runs 28..56 and this is what it starts at.
  heroFontSize: 30,
  screenPadding: 20,
  sectionGap: 20,
  searchHeight: 70,
  // Half the default height is visually identical to the existing pill token.
  searchRadius: 35,
  ctaHeight: 48,
  ctaRadius: 24,
  jobCardRadius: 20,
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
