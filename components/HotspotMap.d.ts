// Type surface for the platform-resolved HotspotMap. At bundle time Metro
// picks HotspotMap.native.tsx (iOS/Android) or HotspotMap.web.tsx (web); this
// declaration is what TypeScript resolves for the bare `./HotspotMap` import.
import type { HotspotMapProps } from '../lib/hotspots';

export declare function HotspotMap(props: HotspotMapProps): JSX.Element;
