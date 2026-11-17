import type { ImagePickerOptions } from 'expo-image-picker';
import {
  UIImagePickerControllerQualityType,
  UIImagePickerPreferredAssetRepresentationMode,
  VideoExportPreset,
} from 'expo-image-picker';
import { MAX_VIDEO_SECONDS } from './uploadRules';

/**
 * R7-b / B10 (A4-M3) — THE options every photo and video picker opens with.
 * A call site spreads it first and adds only what is its own (mediaTypes,
 * multiple selection, a crop):
 *
 *   ImagePicker.launchImageLibraryAsync({ ...PICKER_MEDIA_OPTIONS, mediaTypes: ['images'] })
 *
 * tests/pickerOptions.test.mjs fails when a call site opens a picker without
 * it, or overrides one of these keys. Read from the installed native source
 * (node_modules/expo-image-picker/ios, version 17.0.11):
 *
 * - preferredAssetRepresentationMode 'compatible' + quality 0.7: the library
 *   picker's copy-the-original fast path runs only at quality >= 1 with mode
 *   'current' (MediaHandler.swift:124-126), and that path hands over a HEIC
 *   photo as it is, location included. Off it, the photo is decoded to a
 *   UIImage and written again as JPEG (ImageUtils.swift:151-156) unless the
 *   system still reports HEIC first (ImageUtils.swift:145-146), which
 *   'compatible' asks it not to (ImagePickerModule.swift:161). The camera and
 *   the crop picker always write JPEG from a UIImage (MediaHandler.swift:75-81,
 *   ImageUtils.swift:106-108). lib/mediaMetadata.ts removes any location that
 *   still arrives and refuses what it cannot read.
 * - videoExportPreset 960x540: a library clip is exported again as H.264 MP4
 *   (MediaHandler.swift:416-435, VideoUtils.swift:47-76); the default
 *   'passthrough' copies the phone's own 1080p or 4K file, which is too big
 *   for MAX_UPLOAD_BYTES at 30 s.
 * - videoQuality Medium and videoMaxDuration 30 s apply to the camera and the
 *   crop picker only (ImagePickerModule.swift:130-132). The library picker
 *   cannot cap a clip, so rejectionForPickedVideo (lib/storage.ts) refuses a
 *   longer one after the pick.
 * - exif false and base64 false: nothing reads them, and the Exif copy would
 *   carry the location into JavaScript.
 */
export const PICKER_MEDIA_OPTIONS: Readonly<ImagePickerOptions> = Object.freeze({
  preferredAssetRepresentationMode: UIImagePickerPreferredAssetRepresentationMode.Compatible,
  quality: 0.7,
  videoExportPreset: VideoExportPreset.H264_960x540,
  videoQuality: UIImagePickerControllerQualityType.Medium,
  videoMaxDuration: MAX_VIDEO_SECONDS,
  exif: false,
  base64: false,
});

/** The keys a call site may not set itself (the static test reads this list). */
export const PICKER_OWNED_KEYS = Object.freeze(Object.keys(PICKER_MEDIA_OPTIONS));
