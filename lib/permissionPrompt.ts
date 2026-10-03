import { Linking } from 'react-native';
import { confirmAsync } from './dialog';

/**
 * FIX-RUN B11 — a denied permission is never a dead end. One prompt per kind,
 * offering the one place the person can change it: "Open Settings" or "Not
 * now". Every denied branch of a request*PermissionsAsync caller ends here or
 * at an Open Settings control of its own (HotspotMap, Setup).
 */
export type PermissionKind = 'camera' | 'microphone' | 'speech' | 'location';

export const PERMISSION_COPY: Record<PermissionKind, { title: string; message: string }> = {
  camera: {
    title: 'Camera is off',
    message: 'Camera is off for Brazos. Turn it on in Settings to take a photo.',
  },
  microphone: {
    title: 'Microphone is off',
    message: 'Microphone is off for Brazos. Turn it on in Settings to record a voice message.',
  },
  speech: {
    title: 'Speech is off',
    message: 'Speech recognition or the microphone is off for Brazos. Turn them on in Settings to speak instead of typing.',
  },
  location: {
    title: 'Location is off',
    message: 'Location is off for Brazos. Turn it on in Settings, or type the area instead.',
  },
};

/** Asks to open Settings; resolves true when the person chose to go there. */
export async function askOpenSettings(kind: PermissionKind, message?: string): Promise<boolean> {
  const copy = PERMISSION_COPY[kind];
  const open = await confirmAsync({
    title: copy.title,
    message: message ?? copy.message,
    confirmText: 'Open Settings',
    cancelText: 'Not now',
  });
  if (open) {
    try {
      await Linking.openSettings();
    } catch {
      // Nothing else to offer: the prompt already said where the switch is.
    }
  }
  return open;
}
