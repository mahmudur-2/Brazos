# Stage 4D-A — UI Inventory Audit

Read-only audit of the native UI surface. Findings only — no opinions, no
recommendations. Captured 2026-08-17 at HEAD `2f987fc` on `mainexpo`.

**Scope read:** `screens/` (49 screens), `components/`, `ui/`, `navigation/`,
`hooks/`, `modes/`, `lib/theme.ts` — 164 in-scope `.ts`/`.tsx` files — plus
`lib/legal/` for section 4's legal sub-table only. Locked screens (01–07, 48)
are inventoried, never edited. **Excluded entirely:** the frozen web/PWA
surface (`public/`, `hosting/`, `dist/`, `*.web.ts`, `*.web.tsx` — including
`components/HotspotMap.web.tsx`, noted by existence only), the service worker,
and web deployment config.

**Method:** sections 1 and 4 are mechanical line scans (regex over every
non-comment line of the in-scope files; multi-line JSX text and
template-literal content captured by a raw-line pass; every ambiguous match
verified against the source by hand). Sections 2, 3, 5 and 6 are file-by-file
reads. All line numbers are from HEAD `2f987fc`.

---

## 1. Token compliance

Totals: **55 literal colours** (hex / `rgb()` / `rgba()` / named) across
**30 usage files**; **878 bare numeric literals** on
padding / margin / gap / borderRadius / fontSize / lineHeight across
**95 usage files**; the two token-definition files (`ui/tokens.ts`,
`lib/theme.ts`) hold a further 79 colour and 15 numeric literals as
definitions, listed separately; **2 files import `ui/tokens` directly** —
`lib/theme.ts` (the sanctioned wrapper) and `lib/authTheme.ts`. Zero screens
or components import `ui/tokens` directly.

Notes on the tables: the Value column is exact; the Context column is the
containing source line, truncated at 90 characters. Comment lines were
excluded from the scan. Named-colour detection covers CSS colour names plus
`'transparent'` on `*color`/`*Color` style properties.

## 1a. Literal colours (usage files)

### components/ActionSheet.tsx — 1

| Line | Kind | Value | Context |
|---|---|---|---|
| 79 | rgb() | `rgba(31,46,34,0.35)` | `backgroundColor: 'rgba(31,46,34,0.35)',` |

### components/AmountPrompt.tsx — 1

| Line | Kind | Value | Context |
|---|---|---|---|
| 98 | rgb() | `rgba(31,46,34,0.45)` | `backgroundColor: 'rgba(31,46,34,0.45)',` |

### components/AuthButton.tsx — 2

| Line | Kind | Value | Context |
|---|---|---|---|
| 109 | named | `borderColor: 'transparent'` | `borderColor: 'transparent',` |
| 115 | named | `backgroundColor: 'transparent'` | `backgroundColor: 'transparent',` |

### components/AuthNotice.tsx — 2

| Line | Kind | Value | Context |
|---|---|---|---|
| 31 | hex | `#3E4F47` | `<Text style={[styles.text, { color: danger ? authColors.danger : '#3E4F47' }]}>` |
| 50 | hex | `#F5E7E4` | `backgroundColor: '#F5E7E4',` |

### components/ChatBubble.tsx — 4

| Line | Kind | Value | Context |
|---|---|---|---|
| 194 | named | `backgroundColor: 'transparent'` | `backgroundColor: 'transparent',` |
| 209 | rgb() | `rgba(244,241,232,0.16)` | `backgroundColor: 'rgba(244,241,232,0.16)',` |
| 242 | rgb() | `rgba(244,241,232,0.8)` | `color: 'rgba(244,241,232,0.8)',` |
| 275 | rgb() | `rgba(244,241,232,0.75)` | `color: 'rgba(244,241,232,0.75)',` |

### components/Chip.tsx — 1

| Line | Kind | Value | Context |
|---|---|---|---|
| 160 | named | `backgroundColor: 'transparent'` | `backgroundColor: 'transparent',` |

### components/ConfirmDialog.tsx — 1

| Line | Kind | Value | Context |
|---|---|---|---|
| 92 | rgb() | `rgba(31,46,34,0.35)` | `backgroundColor: 'rgba(31,46,34,0.35)',` |

### components/CountryPicker.tsx — 1

| Line | Kind | Value | Context |
|---|---|---|---|
| 204 | rgb() | `rgba(11, 32, 25, 0.42)` | `backgroundColor: 'rgba(11, 32, 25, 0.42)',` |

### components/JobVideo.tsx — 3

| Line | Kind | Value | Context |
|---|---|---|---|
| 103 | rgb() | `rgba(15, 31, 23, 0.32)` | `posterScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 31, 23, 0.32)'` |
| 116 | rgb() | `rgba(15, 31, 23, 0.78)` | `backgroundColor: 'rgba(15, 31, 23, 0.78)',` |
| 137 | rgb() | `rgba(15, 31, 23, 0.82)` | `backgroundColor: 'rgba(15, 31, 23, 0.82)',` |

### components/ModeTransitionOverlay.tsx — 2

| Line | Kind | Value | Context |
|---|---|---|---|
| 394 | hex | `#000000` | `backgroundColor: '#000000',` |
| 449 | hex | `#FFF3D6` | `backgroundColor: '#FFF3D6',` |

### components/OtpInput.tsx — 2

| Line | Kind | Value | Context |
|---|---|---|---|
| 167 | named | `color: 'transparent'` | `color: 'transparent',` |
| 168 | named | `backgroundColor: 'transparent'` | `backgroundColor: 'transparent',` |

### components/PhotoViewer.tsx — 5

| Line | Kind | Value | Context |
|---|---|---|---|
| 332 | hex | `#F4F1E8` | `<Ionicons name="close" size={26} color="#F4F1E8" />` |
| 344 | hex | `#F4F1E8` | `<ActivityIndicator size="small" color="#F4F1E8" />` |
| 349 | hex | `#F4F1E8` | `color="#F4F1E8"` |
| 362 | hex | `#000000` | `backgroundColor: '#000000',` |
| 371 | rgb() | `rgba(0,0,0,0.45)` | `backgroundColor: 'rgba(0,0,0,0.45)',` |

### components/PortfolioPicker.tsx — 1

| Line | Kind | Value | Context |
|---|---|---|---|
| 603 | rgb() | `rgba(31,46,34,0.45)` | `backgroundColor: 'rgba(31,46,34,0.45)',` |

### components/ReactionPicker.tsx — 1

| Line | Kind | Value | Context |
|---|---|---|---|
| 55 | rgb() | `rgba(31,46,34,0.35)` | `backgroundColor: 'rgba(31,46,34,0.35)',` |

### components/ReportDialog.tsx — 1

| Line | Kind | Value | Context |
|---|---|---|---|
| 159 | rgb() | `rgba(31,46,34,0.35)` | `backgroundColor: 'rgba(31,46,34,0.35)',` |

### components/ReviewSection.tsx — 1

| Line | Kind | Value | Context |
|---|---|---|---|
| 465 | rgb() | `rgba(31,46,34,0.6)` | `backgroundColor: 'rgba(31,46,34,0.6)',` |

### components/ServicePickerSheet.tsx — 1

| Line | Kind | Value | Context |
|---|---|---|---|
| 121 | rgb() | `rgba(19,32,27,0.42)` | `backgroundColor: 'rgba(19,32,27,0.42)',` |

### components/VoiceNote.tsx — 1

| Line | Kind | Value | Context |
|---|---|---|---|
| 37 | rgb() | `rgba(244,241,232,0.35)` | `const trackTint = isOwn ? 'rgba(244,241,232,0.35)' : colors.border;` |

### screens/BrowseJobsScreen.tsx — 6

| Line | Kind | Value | Context |
|---|---|---|---|
| 45 | hex | `#0DBC5A` | `const AVAILABILITY_ONLINE_COLOR = '#0DBC5A';` |
| 295 | rgb() | `rgba(255,255,255,0.28)` | `trackColor={{ true: AVAILABILITY_ONLINE_COLOR, false: 'rgba(255,255,255,0.28)' }}` |
| 297 | rgb() | `rgba(255,255,255,0.28)` | `ios_backgroundColor="rgba(255,255,255,0.28)"` |
| 598 | rgb() | `rgba(255,255,255,0.18)` | `backgroundColor: 'rgba(255,255,255,0.18)',` |
| 670 | rgb() | `rgba(255,255,255,0.78)` | `color: 'rgba(255,255,255,0.78)',` |
| 699 | rgb() | `rgba(255,255,255,0.14)` | `backgroundColor: 'rgba(255,255,255,0.14)',` |

### screens/CreateAccountScreen.tsx — 1

| Line | Kind | Value | Context |
|---|---|---|---|
| 213 | hex | `#526059` | `color: '#526059',` |

### screens/EmailCreateAccountScreen.tsx — 2

| Line | Kind | Value | Context |
|---|---|---|---|
| 243 | hex | `#F5E7E4` | `backgroundColor: '#F5E7E4',` |
| 261 | hex | `#526059` | `color: '#526059',` |

### screens/EmailSignInScreen.tsx — 1

| Line | Kind | Value | Context |
|---|---|---|---|
| 182 | hex | `#F5E7E4` | `backgroundColor: '#F5E7E4',` |

### screens/HomeScreen.tsx — 4

| Line | Kind | Value | Context |
|---|---|---|---|
| 597 | hex | `#F1EAE2` | `borderColor: '#F1EAE2',` |
| 653 | hex | `#7DE7A4` | `backgroundColor: '#7DE7A4',` |
| 655 | hex | `#0DBC5A` | `liveDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: '#0DBC5A' },` |
| 665 | hex | `#E7E3DB` | `borderColor: '#E7E3DB',` |

### screens/JobDetailScreen.tsx — 2

| Line | Kind | Value | Context |
|---|---|---|---|
| 905 | rgb() | `rgba(0, 0, 0, 0.38)` | `backgroundColor: 'rgba(0, 0, 0, 0.38)',` |
| 917 | rgb() | `rgba(0, 0, 0, 0.58)` | `backgroundColor: 'rgba(0, 0, 0, 0.58)',` |

### screens/ProfileScreen.tsx — 1

| Line | Kind | Value | Context |
|---|---|---|---|
| 919 | rgb() | `rgba(31,46,34,0.45)` | `backgroundColor: 'rgba(31,46,34,0.45)',` |

### screens/VerifyPhoneScreen.tsx — 2

| Line | Kind | Value | Context |
|---|---|---|---|
| 519 | hex | `#7A5A18` | `color: '#7A5A18',` |
| 523 | hex | `#7A5A18` | `color: '#7A5A18',` |

### screens/WelcomeScreen.tsx — 1

| Line | Kind | Value | Context |
|---|---|---|---|
| 50 | hex | `#DEEAD9` | `{ offset: 0.16, color: '#DEEAD9', opacity: 0.8 },` |

### screens/WorkerJobScreen.tsx — 1

| Line | Kind | Value | Context |
|---|---|---|---|
| 763 | rgb() | `rgba(31,46,34,0.6)` | `backgroundColor: 'rgba(31,46,34,0.6)',` |

### ui/primitives/MediaGrid.tsx — 2

| Line | Kind | Value | Context |
|---|---|---|---|
| 131 | rgb() | `rgba(19, 32, 27, 0.72)` | `backgroundColor: 'rgba(19, 32, 27, 0.72)',` |
| 147 | rgb() | `rgba(19, 32, 27, 0.72)` | `backgroundColor: 'rgba(19, 32, 27, 0.72)',` |

### ui/primitives/Sheet.tsx — 1

| Line | Kind | Value | Context |
|---|---|---|---|
| 96 | rgb() | `rgba(19, 32, 27, 0.45)` | `backgroundColor: 'rgba(19, 32, 27, 0.45)',` |

## 1a-def. Colour literals in token-definition files

### lib/theme.ts — 60

| Line | Kind | Value |
|---|---|---|
| 30 | hex | `#1F4D3A` |
| 31 | hex | `#173A2C` |
| 32 | hex | `#E3EBE2` |
| 35 | hex | `#F4F1E8` |
| 38 | hex | `#F59E0B` |
| 46 | hex | `#FAF5F1` |
| 48 | hex | `#526477` |
| 50 | hex | `#1F2E22` |
| 51 | hex | `#6B7566` |
| 52 | hex | `#9AA38F` |
| 54 | hex | `#F4F1E8` |
| 55 | hex | `#FFFFFF` |
| 56 | hex | `#DDD6C4` |
| 62 | hex | `#4C7A3D` |
| 63 | hex | `#E6EDD9` |
| 64 | hex | `#9A5B1E` |
| 65 | hex | `#F3E3C4` |
| 66 | hex | `#A8432B` |
| 67 | hex | `#F3DCD2` |
| 68 | hex | `#3D6B6B` |
| 69 | hex | `#DCE8E6` |
| 70 | hex | `#6B6255` |
| 71 | hex | `#EDE7DA` |
| 73 | hex | `#FFFFFF` |
| 103 | hex | `#3E8863` |
| 104 | hex | `#2E6B4C` |
| 105 | hex | `#1E3328` |
| 106 | hex | `#F4F1E8` |
| 107 | hex | `#F59E0B` |
| 114 | hex | `#0B3B2E` |
| 115 | hex | `#4E9E82` |
| 116 | hex | `#D9B978` |
| 117 | hex | `#2C2617` |
| 118 | hex | `#1C2E27` |
| 119 | hex | `#263D34` |
| 120 | hex | `#F1EDE1` |
| 121 | hex | `#10170F` |
| 122 | hex | `#9CB09E` |
| 124 | hex | `#F1EDE1` |
| 125 | hex | `#9CB09E` |
| 126 | hex | `#6E8272` |
| 128 | hex | `#10170F` |
| 129 | hex | `#1B2620` |
| 130 | hex | `#2E3B33` |
| 132 | hex | `#6FAE59` |
| 133 | hex | `#1C2B18` |
| 134 | hex | `#D08A3E` |
| 135 | hex | `#2E2115` |
| 136 | hex | `#D97561` |
| 137 | hex | `#301E19` |
| 138 | hex | `#5FA3A3` |
| 139 | hex | `#1B2B2A` |
| 140 | hex | `#A79D8B` |
| 141 | hex | `#2A2620` |
| 143 | hex | `#FFFFFF` |
| 193 | rgb() | `rgba(31,46,34,0.07)` |
| 193 | rgb() | `rgba(31,46,34,0.05)` |
| 195 | hex | `#1F2E22` |
| 203 | rgb() | `rgba(31,46,34,0.14)` |
| 205 | hex | `#1F2E22` |

### ui/tokens.ts — 19

| Line | Kind | Value |
|---|---|---|
| 46 | hex | `#064C3B` |
| 48 | hex | `#0D6B52` |
| 50 | hex | `#C8A15B` |
| 52 | hex | `#F3E7CE` |
| 54 | hex | `#E5F1EC` |
| 56 | hex | `#D3E8DF` |
| 58 | hex | `#13201B` |
| 73 | hex | `#F6F3EA` |
| 75 | hex | `#FFFFFF` |
| 77 | hex | `#6E7771` |
| 79 | hex | `#DDE2DD` |
| 81 | hex | `#9C3F35` |
| 84 | hex | `#F5E7E4` |
| 85 | hex | `#E9CAC5` |
| 87 | hex | `#CBE0D7` |
| 89 | hex | `#839087` |
| 94 | hex | `#FFFFFF` |
| 203 | rgb() | `rgba(16,38,29,0.08)` |
| 205 | hex | `#10261D` |

## 1b. Bare numeric literals (usage files)

### components/ActionSheet.tsx — 5

| Line | Property | Value | Context |
|---|---|---|---|
| 97 | gap | 2 | `gap: 2,` |
| 100 | fontSize | 16 | `fontSize: 16,` |
| 105 | fontSize | 13 | `fontSize: 13,` |
| 121 | fontSize | 16 | `fontSize: 16,` |
| 133 | fontSize | 16 | `fontSize: 16,` |

### components/AmountPrompt.tsx — 6

| Line | Property | Value | Context |
|---|---|---|---|
| 112 | fontSize | 18 | `fontSize: 18,` |
| 117 | fontSize | 14 | `fontSize: 14,` |
| 119 | lineHeight | 19 | `lineHeight: 19,` |
| 132 | fontSize | 20 | `fontSize: 20,` |
| 139 | fontSize | 20 | `fontSize: 20,` |
| 144 | fontSize | 13 | `fontSize: 13,` |

### components/AppErrorBoundary.tsx — 4

| Line | Property | Value | Context |
|---|---|---|---|
| 88 | fontSize | 22 | `fontSize: 22,` |
| 94 | fontSize | 15 | `fontSize: 15,` |
| 96 | lineHeight | 22 | `lineHeight: 22,` |
| 114 | fontSize | 16 | `fontSize: 16,` |

### components/AuthButton.tsx — 1

| Line | Property | Value | Context |
|---|---|---|---|
| 107 | paddingHorizontal | 16 | `paddingHorizontal: 16,` |

### components/AuthField.tsx — 5

| Line | Property | Value | Context |
|---|---|---|---|
| 84 | gap | 6 | `gap: 6,` |
| 90 | marginLeft | 2 | `marginLeft: 2,` |
| 110 | fontSize | 13 | `fontSize: 13,` |
| 112 | marginLeft | 2 | `marginLeft: 2,` |
| 113 | marginTop | 2 | `marginTop: 2,` |

### components/BrowseJobCard.tsx — 11

| Line | Property | Value | Context |
|---|---|---|---|
| 149 | gap | 3 | `gap: 3,` |
| 152 | fontSize | 16 | `fontSize: 16,` |
| 155 | lineHeight | 21 | `lineHeight: 21,` |
| 158 | fontSize | 13 | `fontSize: 13,` |
| 164 | gap | 3 | `gap: 3,` |
| 168 | paddingVertical | 2 | `paddingVertical: 2,` |
| 170 | marginTop | 2 | `marginTop: 2,` |
| 173 | fontSize | 10 | `fontSize: 10,` |
| 185 | fontSize | 16 | `fontSize: 16,` |
| 191 | fontSize | 12 | `fontSize: 12,` |
| 196 | fontSize | 12 | `fontSize: 12,` |

### components/Button.tsx — 6

| Line | Property | Value | Context |
|---|---|---|---|
| 22 | fontSize | 13 | `sm: { height: 44, fontSize: 13, paddingHorizontal: 14 },` |
| 22 | paddingHorizontal | 14 | `sm: { height: 44, fontSize: 13, paddingHorizontal: 14 },` |
| 23 | fontSize | 16 | `md: { height: 52, fontSize: 16, paddingHorizontal: 16 },` |
| 23 | paddingHorizontal | 16 | `md: { height: 52, fontSize: 16, paddingHorizontal: 16 },` |
| 24 | fontSize | 19 | `lg: { height: 64, fontSize: 19, paddingHorizontal: 20 },` |
| 24 | paddingHorizontal | 20 | `lg: { height: 64, fontSize: 19, paddingHorizontal: 20 },` |

### components/CategoryAccordion.tsx — 4

| Line | Property | Value | Context |
|---|---|---|---|
| 136 | fontSize | 14 | `fontSize: 14,` |
| 159 | fontSize | 14 | `fontSize: 14,` |
| 172 | fontSize | 14 | `fontSize: 14,` |
| 183 | borderRadius | 17 | `borderRadius: 17,` |

### components/ChatBubble.tsx — 16

| Line | Property | Value | Context |
|---|---|---|---|
| 159 | paddingLeft | 40 | `paddingLeft: 40,` |
| 163 | paddingRight | 40 | `paddingRight: 40,` |
| 180 | borderBottomRightRadius | 4 | `borderBottomRightRadius: 4,` |
| 186 | borderBottomLeftRadius | 4 | `borderBottomLeftRadius: 4,` |
| 217 | borderRadius | 2 | `borderRadius: 2,` |
| 227 | gap | 1 | `gap: 1,` |
| 230 | fontSize | 12 | `fontSize: 12,` |
| 238 | fontSize | 12 | `fontSize: 12,` |
| 257 | fontSize | 15 | `fontSize: 15,` |
| 258 | lineHeight | 20 | `lineHeight: 20,` |
| 265 | fontSize | 14 | `fontSize: 14,` |
| 270 | fontSize | 11 | `fontSize: 11,` |
| 281 | gap | 2 | `gap: 2,` |
| 286 | paddingHorizontal | 6 | `paddingHorizontal: 6,` |
| 287 | paddingVertical | 2 | `paddingVertical: 2,` |
| 297 | fontSize | 13 | `fontSize: 13,` |

### components/ChatComposer.tsx — 4

| Line | Property | Value | Context |
|---|---|---|---|
| 231 | borderRadius | 4 | `borderRadius: 4,` |
| 235 | fontSize | 15 | `fontSize: 15,` |
| 254 | fontSize | 15 | `fontSize: 15,` |
| 255 | lineHeight | 19 | `lineHeight: 19,` |

### components/Chip.tsx — 2

| Line | Property | Value | Context |
|---|---|---|---|
| 179 | fontSize | 14 | `fontSize: 14,` |
| 184 | fontSize | 12 | `fontSize: 12,` |

### components/ConfirmDialog.tsx — 3

| Line | Property | Value | Context |
|---|---|---|---|
| 106 | fontSize | 19 | `fontSize: 19,` |
| 110 | fontSize | 14 | `fontSize: 14,` |
| 112 | lineHeight | 20 | `lineHeight: 20,` |

### components/ConversationRow.tsx — 11

| Line | Property | Value | Context |
|---|---|---|---|
| 110 | gap | 2 | `gap: 2,` |
| 119 | fontSize | 16 | `fontSize: 16,` |
| 124 | fontSize | 12 | `fontSize: 12,` |
| 128 | fontSize | 12 | `fontSize: 12,` |
| 136 | marginTop | 2 | `marginTop: 2,` |
| 140 | fontSize | 14 | `fontSize: 14,` |
| 150 | borderRadius | 5 | `borderRadius: 5,` |
| 163 | gap | 4 | `gap: 4,` |
| 167 | paddingVertical | 3 | `paddingVertical: 3,` |
| 169 | marginTop | 2 | `marginTop: 2,` |
| 172 | fontSize | 11 | `fontSize: 11,` |

### components/CountryPicker.tsx — 9

| Line | Property | Value | Context |
|---|---|---|---|
| 210 | borderTopLeftRadius | 26 | `borderTopLeftRadius: 26,` |
| 211 | borderTopRightRadius | 26 | `borderTopRightRadius: 26,` |
| 216 | borderRadius | 2 | `borderRadius: 2,` |
| 219 | marginTop | 10 | `marginTop: 10,` |
| 231 | fontSize | 17 | `fontSize: 17,` |
| 255 | fontSize | 16 | `fontSize: 16,` |
| 269 | fontSize | 22 | `fontSize: 22,` |
| 273 | fontSize | 16 | `fontSize: 16,` |
| 277 | fontSize | 15 | `fontSize: 15,` |

### components/HotspotMap.native.tsx — 5

| Line | Property | Value | Context |
|---|---|---|---|
| 230 | fontSize | 18 | `fontSize: 18,` |
| 234 | fontSize | 14 | `fontSize: 14,` |
| 237 | lineHeight | 20 | `lineHeight: 20,` |
| 257 | fontSize | 13 | `fontSize: 13,` |
| 275 | fontSize | 13 | `fontSize: 13,` |

### components/HubCard.tsx — 13

| Line | Property | Value | Context |
|---|---|---|---|
| 165 | gap | 3 | `gap: 3,` |
| 168 | fontSize | 18 | `fontSize: 18,` |
| 169 | lineHeight | 22 | `lineHeight: 22,` |
| 174 | fontSize | 13 | `fontSize: 13,` |
| 188 | gap | 1 | `gap: 1,` |
| 191 | fontSize | 11 | `fontSize: 11,` |
| 197 | fontSize | 19 | `fontSize: 19,` |
| 216 | gap | 2 | `gap: 2,` |
| 225 | fontSize | 14 | `fontSize: 14,` |
| 226 | lineHeight | 18 | `lineHeight: 18,` |
| 232 | fontSize | 11 | `fontSize: 11,` |
| 237 | fontSize | 12 | `fontSize: 12,` |
| 242 | fontSize | 13 | `fontSize: 13,` |

### components/JobFilterSheet.tsx — 7

| Line | Property | Value | Context |
|---|---|---|---|
| 176 | fontSize | 11 | `fontSize: 11,` |
| 201 | fontSize | 13 | `fontSize: 13,` |
| 209 | fontSize | 12 | `fontSize: 12,` |
| 211 | lineHeight | 17 | `lineHeight: 17,` |
| 223 | borderRadius | 11 | `borderRadius: 11,` |
| 235 | borderRadius | 5 | `borderRadius: 5,` |
| 239 | fontSize | 15 | `fontSize: 15,` |

### components/JobProgress.tsx — 5

| Line | Property | Value | Context |
|---|---|---|---|
| 92 | borderRadius | 13 | `borderRadius: 13,` |
| 97 | fontSize | 12 | `fontSize: 12,` |
| 101 | fontSize | 12 | `fontSize: 12,` |
| 108 | marginTop | 12 | `marginTop: 12,` |
| 109 | marginHorizontal | -12 | `marginHorizontal: -12,` |

### components/JobVideo.tsx — 1

| Line | Property | Value | Context |
|---|---|---|---|
| 118 | fontSize | 12 | `posterText: { fontSize: 12, fontWeight: '700', color: colors.white },` |

### components/MapPinIcon.tsx — 5

| Line | Property | Value | Context |
|---|---|---|---|
| 49 | borderRadius | 1 | `borderRadius: 1,` |
| 60 | borderRadius | 1 | `borderRadius: 1,` |
| 71 | borderRadius | 3 | `borderRadius: 3,` |
| 83 | borderRadius | 3 | `borderRadius: 3,` |
| 106 | borderRadius | 2 | `borderRadius: 2,` |

### components/MarkdownText.tsx — 9

| Line | Property | Value | Context |
|---|---|---|---|
| 101 | fontSize | 22 | `fontSize: 22,` |
| 107 | fontSize | 17 | `fontSize: 17,` |
| 113 | fontSize | 15 | `fontSize: 15,` |
| 119 | fontSize | 14 | `fontSize: 14,` |
| 120 | lineHeight | 21 | `lineHeight: 21,` |
| 129 | fontSize | 14 | `fontSize: 14,` |
| 130 | lineHeight | 21 | `lineHeight: 21,` |
| 135 | fontSize | 14 | `fontSize: 14,` |
| 136 | lineHeight | 21 | `lineHeight: 21,` |

### components/MarketJobPreview.tsx — 12

| Line | Property | Value | Context |
|---|---|---|---|
| 203 | fontSize | 12 | `fontSize: 12,` |
| 207 | fontSize | 22 | `fontSize: 22,` |
| 210 | lineHeight | 29 | `lineHeight: 29,` |
| 213 | gap | 2 | `gap: 2,` |
| 216 | fontSize | 11 | `fontSize: 11,` |
| 222 | fontSize | 20 | `fontSize: 20,` |
| 234 | fontSize | 13 | `fontSize: 13,` |
| 238 | fontSize | 15 | `fontSize: 15,` |
| 240 | lineHeight | 22 | `lineHeight: 22,` |
| 261 | fontSize | 15 | `fontSize: 15,` |
| 277 | fontSize | 13 | `fontSize: 13,` |
| 279 | lineHeight | 19 | `lineHeight: 19,` |

### components/ModeTransitionOverlay.tsx — 3

| Line | Property | Value | Context |
|---|---|---|---|
| 432 | borderRadius | 3.5 | `borderRadius: 3.5,` |
| 440 | borderRadius | 2 | `borderRadius: 2,` |
| 448 | borderRadius | 1.2 | `borderRadius: 1.2,` |

### components/OfferCard.tsx — 27

| Line | Property | Value | Context |
|---|---|---|---|
| 512 | fontSize | 11 | `fontSize: 11,` |
| 547 | fontSize | 18 | `fontSize: 18,` |
| 558 | fontSize | 14 | `fontSize: 14,` |
| 563 | fontSize | 13 | `fontSize: 13,` |
| 567 | fontSize | 13 | `fontSize: 13,` |
| 569 | marginHorizontal | 1 | `marginHorizontal: 1,` |
| 577 | fontSize | 14 | `fontSize: 14,` |
| 579 | lineHeight | 20 | `lineHeight: 20,` |
| 594 | fontSize | 10 | `fontSize: 10,` |
| 600 | fontSize | 24 | `fontSize: 24,` |
| 628 | fontSize | 11 | `fontSize: 11,` |
| 644 | fontSize | 13 | `fontSize: 13,` |
| 656 | gap | 2 | `gap: 2,` |
| 680 | borderRadius | 12 | `borderRadius: 12,` |
| 687 | fontSize | 11 | `fontSize: 11,` |
| 697 | fontSize | 15 | `fontSize: 15,` |
| 703 | fontSize | 12 | `fontSize: 12,` |
| 707 | fontSize | 20 | `fontSize: 20,` |
| 713 | fontSize | 12 | `fontSize: 12,` |
| 718 | fontSize | 13 | `fontSize: 13,` |
| 720 | lineHeight | 18 | `lineHeight: 18,` |
| 742 | fontSize | 10 | `fontSize: 10,` |
| 747 | fontSize | 12 | `fontSize: 12,` |
| 752 | fontSize | 11 | `fontSize: 11,` |
| 757 | fontSize | 12 | `fontSize: 12,` |
| 762 | fontSize | 12 | `fontSize: 12,` |
| 768 | fontSize | 11 | `fontSize: 11,` |

### components/OfferComposer.tsx — 9

| Line | Property | Value | Context |
|---|---|---|---|
| 283 | fontSize | 11 | `fontSize: 11,` |
| 289 | fontSize | 19 | `fontSize: 19,` |
| 294 | fontSize | 13 | `fontSize: 13,` |
| 296 | lineHeight | 19 | `lineHeight: 19,` |
| 299 | fontSize | 14 | `fontSize: 14,` |
| 314 | fontSize | 13 | `fontSize: 13,` |
| 319 | fontSize | 18 | `fontSize: 18,` |
| 335 | fontSize | 13 | `fontSize: 13,` |
| 337 | lineHeight | 19 | `lineHeight: 19,` |

### components/OfferResponseActions.tsx — 14

| Line | Property | Value | Context |
|---|---|---|---|
| 147 | fontSize | 17 | `fontSize: 17,` |
| 150 | lineHeight | 22 | `lineHeight: 22,` |
| 153 | fontSize | 14 | `fontSize: 14,` |
| 154 | lineHeight | 19 | `lineHeight: 19,` |
| 157 | fontSize | 28 | `fontSize: 28,` |
| 160 | lineHeight | 34 | `lineHeight: 34,` |
| 163 | fontSize | 22 | `fontSize: 22,` |
| 164 | lineHeight | 27 | `lineHeight: 27,` |
| 167 | fontSize | 13 | `fontSize: 13,` |
| 170 | lineHeight | 19 | `lineHeight: 19,` |
| 173 | fontSize | 12 | `fontSize: 12,` |
| 174 | lineHeight | 17 | `lineHeight: 17,` |
| 181 | fontSize | 12 | `fontSize: 12,` |
| 184 | lineHeight | 17 | `lineHeight: 17,` |

### components/OtpInput.tsx — 1

| Line | Property | Value | Context |
|---|---|---|---|
| 155 | fontSize | 24 | `fontSize: 24,` |

### components/PastWork.tsx — 12

| Line | Property | Value | Context |
|---|---|---|---|
| 236 | fontSize | 17 | `fontSize: 17,` |
| 244 | fontSize | 14 | `fontSize: 14,` |
| 247 | lineHeight | 20 | `lineHeight: 20,` |
| 250 | fontSize | 14 | `fontSize: 14,` |
| 260 | fontSize | 13 | `fontSize: 13,` |
| 264 | lineHeight | 18 | `lineHeight: 18,` |
| 283 | fontSize | 12 | `fontSize: 12,` |
| 299 | gap | 4 | `gap: 4,` |
| 313 | borderRadius | 12 | `borderRadius: 12,` |
| 321 | fontSize | 11 | `fontSize: 11,` |
| 329 | fontSize | 13 | `fontSize: 13,` |
| 331 | lineHeight | 17 | `lineHeight: 17,` |

### components/PhoneNumberInput.tsx — 9

| Line | Property | Value | Context |
|---|---|---|---|
| 157 | gap | 6 | `gap: 6,` |
| 163 | marginLeft | 2 | `marginLeft: 2,` |
| 173 | gap | 5 | `gap: 5,` |
| 185 | fontSize | 18 | `fontSize: 18,` |
| 188 | fontSize | 15 | `fontSize: 15,` |
| 203 | fontSize | 16 | `fontSize: 16,` |
| 226 | fontSize | 13 | `fontSize: 13,` |
| 228 | marginLeft | 2 | `marginLeft: 2,` |
| 229 | marginTop | 2 | `marginTop: 2,` |

### components/PhotoViewer.tsx — 1

| Line | Property | Value | Context |
|---|---|---|---|
| 370 | borderRadius | 20 | `borderRadius: 20,` |

### components/PortfolioPicker.tsx — 19

| Line | Property | Value | Context |
|---|---|---|---|
| 528 | fontSize | 20 | `fontSize: 20,` |
| 533 | fontSize | 13 | `fontSize: 13,` |
| 537 | lineHeight | 18 | `lineHeight: 18,` |
| 547 | fontSize | 14 | `fontSize: 14,` |
| 550 | lineHeight | 20 | `lineHeight: 20,` |
| 558 | paddingTop | 0 | `paddingTop: 0,` |
| 562 | gap | 2 | `gap: 2,` |
| 580 | borderRadius | 12 | `borderRadius: 12,` |
| 586 | fontSize | 11 | `fontSize: 11,` |
| 594 | fontSize | 12 | `fontSize: 12,` |
| 625 | fontSize | 18 | `fontSize: 18,` |
| 637 | fontSize | 13 | `fontSize: 13,` |
| 643 | fontSize | 12 | `fontSize: 12,` |
| 655 | gap | 4 | `gap: 4,` |
| 668 | fontSize | 12 | `fontSize: 12,` |
| 681 | fontSize | 14 | `fontSize: 14,` |
| 690 | fontSize | 15 | `fontSize: 15,` |
| 696 | fontSize | 11 | `fontSize: 11,` |
| 722 | fontSize | 14 | `fontSize: 14,` |

### components/QuickReplies.tsx — 1

| Line | Property | Value | Context |
|---|---|---|---|
| 122 | fontSize | 13 | `fontSize: 13,` |

### components/ReactionPicker.tsx — 3

| Line | Property | Value | Context |
|---|---|---|---|
| 72 | fontSize | 14 | `fontSize: 14,` |
| 96 | fontSize | 28 | `fontSize: 28,` |
| 104 | fontSize | 14 | `fontSize: 14,` |

### components/ReportDialog.tsx — 4

| Line | Property | Value | Context |
|---|---|---|---|
| 176 | fontSize | 19 | `fontSize: 19,` |
| 181 | fontSize | 13 | `fontSize: 13,` |
| 184 | lineHeight | 18 | `lineHeight: 18,` |
| 209 | fontSize | 15 | `fontSize: 15,` |

### components/ReviewSection.tsx — 8

| Line | Property | Value | Context |
|---|---|---|---|
| 404 | fontSize | 17 | `fontSize: 17,` |
| 428 | fontSize | 17 | `fontSize: 17,` |
| 434 | fontSize | 14 | `fontSize: 14,` |
| 435 | lineHeight | 20 | `lineHeight: 20,` |
| 464 | borderRadius | 15 | `borderRadius: 15,` |
| 476 | fontSize | 17 | `fontSize: 17,` |
| 481 | fontSize | 14 | `fontSize: 14,` |
| 487 | fontSize | 13 | `fontSize: 13,` |

### components/ScreenHeader.tsx — 3

| Line | Property | Value | Context |
|---|---|---|---|
| 106 | fontSize | 24 | `fontSize: 24,` |
| 118 | fontSize | 14 | `fontSize: 14,` |
| 119 | marginTop | 2 | `marginTop: 2,` |

### components/SectionHeader.tsx — 2

| Line | Property | Value | Context |
|---|---|---|---|
| 73 | fontSize | 24 | `fontSize: 24,` |
| 86 | fontSize | 15 | `fontSize: 15,` |

### components/SegmentedControl.tsx — 3

| Line | Property | Value | Context |
|---|---|---|---|
| 61 | padding | 3 | `padding: 3,` |
| 62 | gap | 3 | `gap: 3,` |
| 79 | fontSize | 13 | `fontSize: 13,` |

### components/ServicePickerSheet.tsx — 4

| Line | Property | Value | Context |
|---|---|---|---|
| 149 | gap | 2 | `gap: 2,` |
| 153 | fontSize | 22 | `fontSize: 22,` |
| 158 | fontSize | 13 | `fontSize: 13,` |
| 200 | fontSize | 15 | `fontSize: 15,` |

### components/SetupChoiceCard.tsx — 2

| Line | Property | Value | Context |
|---|---|---|---|
| 138 | fontSize | 19 | `fontSize: 19,` |
| 139 | lineHeight | 24 | `lineHeight: 24,` |

### components/SetupRow.tsx — 4

| Line | Property | Value | Context |
|---|---|---|---|
| 140 | gap | 2 | `gap: 2,` |
| 143 | fontSize | 16 | `fontSize: 16,` |
| 152 | fontSize | 12 | `fontSize: 12,` |
| 153 | lineHeight | 16.5 | `lineHeight: 16.5,` |

### components/StarRating.tsx — 2

| Line | Property | Value | Context |
|---|---|---|---|
| 50 | gap | 6 | `gap: 6,` |
| 53 | padding | 2 | `padding: 2,` |

### components/StatusBadge.tsx — 1

| Line | Property | Value | Context |
|---|---|---|---|
| 70 | fontSize | 12 | `fontSize: 12,` |

### components/TextField.tsx — 4

| Line | Property | Value | Context |
|---|---|---|---|
| 62 | fontSize | 13 | `fontSize: 13,` |
| 66 | fontSize | 12 | `fontSize: 12,` |
| 73 | fontSize | 16 | `fontSize: 16,` |
| 76 | fontSize | 12 | `fontSize: 12,` |

### components/VerificationBadge.tsx — 3

| Line | Property | Value | Context |
|---|---|---|---|
| 33 | gap | 3 | `gap: 3,` |
| 35 | paddingVertical | 3 | `paddingVertical: 3,` |
| 45 | fontSize | 11 | `fontSize: 11,` |

### components/VoiceNote.tsx — 4

| Line | Property | Value | Context |
|---|---|---|---|
| 117 | borderRadius | 16 | `borderRadius: 16,` |
| 123 | marginLeft | 2 | `marginLeft: 2,` |
| 129 | gap | 2 | `gap: 2,` |
| 138 | fontSize | 11 | `fontSize: 11,` |

### components/WorkerJobCard.tsx — 10

| Line | Property | Value | Context |
|---|---|---|---|
| 197 | gap | 4 | `gap: 4,` |
| 209 | fontSize | 16 | `fontSize: 16,` |
| 219 | gap | 5 | `gap: 5,` |
| 223 | fontSize | 13 | `fontSize: 13,` |
| 229 | gap | 5 | `gap: 5,` |
| 232 | fontSize | 12 | `fontSize: 12,` |
| 243 | fontSize | 10 | `fontSize: 10,` |
| 249 | marginTop | 3 | `marginTop: 3,` |
| 250 | fontSize | 26 | `fontSize: 26,` |
| 251 | lineHeight | 30 | `lineHeight: 30,` |

### screens/AdminReportsScreen.tsx — 11

| Line | Property | Value | Context |
|---|---|---|---|
| 249 | borderRadius | 36 | `borderRadius: 36,` |
| 256 | fontSize | 18 | `fontSize: 18,` |
| 261 | fontSize | 14 | `fontSize: 14,` |
| 264 | lineHeight | 20 | `lineHeight: 20,` |
| 274 | fontSize | 17 | `fontSize: 17,` |
| 279 | fontSize | 13 | `fontSize: 13,` |
| 284 | fontSize | 13 | `fontSize: 13,` |
| 290 | fontSize | 14 | `fontSize: 14,` |
| 293 | lineHeight | 20 | `lineHeight: 20,` |
| 303 | fontSize | 12 | `fontSize: 12,` |
| 316 | fontSize | 14 | `fontSize: 14,` |

### screens/ApproveOrDisputeScreen.tsx — 16

| Line | Property | Value | Context |
|---|---|---|---|
| 405 | fontSize | 11 | `fontSize: 11,` |
| 411 | fontSize | 16 | `fontSize: 16,` |
| 424 | fontSize | 13 | `fontSize: 13,` |
| 426 | lineHeight | 19 | `lineHeight: 19,` |
| 438 | fontSize | 13 | `fontSize: 13,` |
| 440 | lineHeight | 19 | `lineHeight: 19,` |
| 456 | fontSize | 16 | `fontSize: 16,` |
| 461 | fontSize | 14 | `fontSize: 14,` |
| 466 | fontSize | 13 | `fontSize: 13,` |
| 468 | lineHeight | 19 | `lineHeight: 19,` |
| 471 | fontSize | 12 | `fontSize: 12,` |
| 473 | lineHeight | 17 | `lineHeight: 17,` |
| 496 | borderRadius | 11 | `borderRadius: 11,` |
| 508 | borderRadius | 5 | `borderRadius: 5,` |
| 513 | fontSize | 15 | `fontSize: 15,` |
| 523 | fontSize | 15 | `fontSize: 15,` |

### screens/BidDetailScreen.tsx — 12

| Line | Property | Value | Context |
|---|---|---|---|
| 363 | fontSize | 12 | `fontSize: 12,` |
| 367 | fontSize | 32 | `fontSize: 32,` |
| 372 | fontSize | 13 | `fontSize: 13,` |
| 374 | lineHeight | 19 | `lineHeight: 19,` |
| 400 | fontSize | 17 | `fontSize: 17,` |
| 405 | fontSize | 13 | `fontSize: 13,` |
| 409 | fontSize | 15 | `fontSize: 15,` |
| 411 | lineHeight | 22 | `lineHeight: 22,` |
| 427 | fontSize | 14 | `fontSize: 14,` |
| 429 | lineHeight | 20 | `lineHeight: 20,` |
| 440 | fontSize | 13 | `fontSize: 13,` |
| 442 | lineHeight | 19 | `lineHeight: 19,` |

### screens/BidSentScreen.tsx — 4

| Line | Property | Value | Context |
|---|---|---|---|
| 68 | fontSize | 15 | `fontSize: 15,` |
| 73 | fontSize | 28 | `fontSize: 28,` |
| 78 | fontSize | 13 | `fontSize: 13,` |
| 80 | lineHeight | 19 | `lineHeight: 19,` |

### screens/BrowseJobsScreen.tsx — 40

| Line | Property | Value | Context |
|---|---|---|---|
| 443 | paddingHorizontal | 20 | `paddingHorizontal: 20,` |
| 463 | gap | 2 | `gap: 2,` |
| 467 | fontSize | 18 | `fontSize: 18,` |
| 474 | gap | 6 | `gap: 6,` |
| 476 | paddingHorizontal | 12 | `paddingHorizontal: 12,` |
| 486 | fontSize | 13 | `fontSize: 13,` |
| 499 | gap | 4 | `gap: 4,` |
| 509 | fontSize | 33 | `fontSize: 33,` |
| 510 | lineHeight | 39 | `lineHeight: 39,` |
| 517 | fontSize | 16 | `fontSize: 16,` |
| 522 | marginTop | 6 | `marginTop: 6,` |
| 533 | paddingHorizontal | 16 | `paddingHorizontal: 16,` |
| 542 | fontSize | 16 | `fontSize: 16,` |
| 544 | paddingVertical | 0 | `paddingVertical: 0,` |
| 561 | paddingBottom | 19 | `paddingBottom: 19,` |
| 565 | marginBottom | 7 | `marginBottom: 7,` |
| 611 | marginBottom | 10 | `marginBottom: 10,` |
| 617 | fontSize | 11 | `fontSize: 11,` |
| 626 | lineHeight | 13 | `lineHeight: 13,` |
| 642 | marginTop | 8 | `marginTop: 8,` |
| 645 | fontSize | 34 | `fontSize: 34,` |
| 646 | lineHeight | 39 | `lineHeight: 39,` |
| 654 | fontSize | 31 | `fontSize: 31,` |
| 655 | lineHeight | 36 | `lineHeight: 36,` |
| 656 | marginTop | 0 | `marginTop: 0,` |
| 661 | gap | 7 | `gap: 7,` |
| 665 | marginTop | 8 | `marginTop: 8,` |
| 668 | fontSize | 12 | `fontSize: 12,` |
| 669 | lineHeight | 16 | `lineHeight: 16,` |
| 678 | marginTop | 8 | `marginTop: 8,` |
| 686 | marginTop | 2 | `marginTop: 2,` |
| 693 | gap | 6 | `gap: 6,` |
| 705 | fontSize | 14 | `fontSize: 14,` |
| 730 | fontSize | 22 | `fontSize: 22,` |
| 742 | fontSize | 17 | `fontSize: 17,` |
| 760 | borderRadius | 36 | `borderRadius: 36,` |
| 767 | fontSize | 18 | `fontSize: 18,` |
| 772 | fontSize | 14 | `fontSize: 14,` |
| 775 | lineHeight | 20 | `lineHeight: 20,` |
| 783 | fontSize | 14 | `fontSize: 14,` |

### screens/CellJobsScreen.tsx — 5

| Line | Property | Value | Context |
|---|---|---|---|
| 171 | borderRadius | 36 | `borderRadius: 36,` |
| 178 | fontSize | 18 | `fontSize: 18,` |
| 183 | fontSize | 14 | `fontSize: 14,` |
| 186 | lineHeight | 20 | `lineHeight: 20,` |
| 193 | fontSize | 14 | `fontSize: 14,` |

### screens/ChatScreen.tsx — 17

| Line | Property | Value | Context |
|---|---|---|---|
| 1315 | borderRadius | 32 | `borderRadius: 32,` |
| 1322 | fontSize | 17 | `fontSize: 17,` |
| 1327 | fontSize | 14 | `fontSize: 14,` |
| 1331 | lineHeight | 20 | `lineHeight: 20,` |
| 1348 | fontSize | 12 | `fontSize: 12,` |
| 1358 | paddingLeft | 24 | `paddingLeft: 24,` |
| 1362 | paddingRight | 24 | `paddingRight: 24,` |
| 1377 | borderRadius | 2 | `borderRadius: 2,` |
| 1382 | gap | 1 | `gap: 1,` |
| 1385 | fontSize | 12 | `fontSize: 12,` |
| 1390 | fontSize | 13 | `fontSize: 13,` |
| 1411 | fontSize | 13 | `fontSize: 13,` |
| 1413 | lineHeight | 18 | `lineHeight: 18,` |
| 1429 | fontSize | 13 | `fontSize: 13,` |
| 1431 | lineHeight | 18 | `lineHeight: 18,` |
| 1450 | fontSize | 13 | `fontSize: 13,` |
| 1459 | fontSize | 14 | `fontSize: 14,` |

### screens/CheckoutScreen.tsx — 8

| Line | Property | Value | Context |
|---|---|---|---|
| 335 | fontSize | 12 | `fontSize: 12,` |
| 338 | lineHeight | 18 | `lineHeight: 18,` |
| 355 | fontSize | 14 | `fontSize: 14,` |
| 360 | fontSize | 14 | `fontSize: 14,` |
| 371 | fontSize | 15 | `fontSize: 15,` |
| 376 | fontSize | 18 | `fontSize: 18,` |
| 390 | fontSize | 13 | `fontSize: 13,` |
| 392 | lineHeight | 19 | `lineHeight: 19,` |

### screens/ClientJobDetailScreen.tsx — 17

| Line | Property | Value | Context |
|---|---|---|---|
| 1102 | lineHeight | 34 | `lineHeight: 34,` |
| 1108 | lineHeight | 21 | `lineHeight: 21,` |
| 1153 | gap | 2 | `gap: 2,` |
| 1157 | fontSize | 15 | `fontSize: 15,` |
| 1160 | lineHeight | 21 | `lineHeight: 21,` |
| 1163 | fontSize | 12 | `fontSize: 12,` |
| 1165 | lineHeight | 17 | `lineHeight: 17,` |
| 1176 | fontSize | 16 | `fontSize: 16,` |
| 1177 | lineHeight | 24 | `lineHeight: 24,` |
| 1215 | lineHeight | 21 | `lineHeight: 21,` |
| 1258 | lineHeight | 20 | `lineHeight: 20,` |
| 1284 | fontSize | 17 | `fontSize: 17,` |
| 1343 | lineHeight | 18 | `lineHeight: 18,` |
| 1371 | borderRadius | 36 | `borderRadius: 36,` |
| 1385 | lineHeight | 21 | `lineHeight: 21,` |
| 1416 | lineHeight | 21 | `lineHeight: 21,` |
| 1443 | lineHeight | 22 | `lineHeight: 22,` |

### screens/CompareBidsScreen.tsx — 10

| Line | Property | Value | Context |
|---|---|---|---|
| 208 | paddingVertical | 2 | `paddingVertical: 2,` |
| 212 | fontSize | 10 | `fontSize: 10,` |
| 226 | gap | 2 | `gap: 2,` |
| 229 | fontSize | 16 | `fontSize: 16,` |
| 240 | fontSize | 13 | `fontSize: 13,` |
| 245 | fontSize | 12 | `fontSize: 12,` |
| 249 | fontSize | 20 | `fontSize: 20,` |
| 254 | fontSize | 13 | `fontSize: 13,` |
| 257 | lineHeight | 19 | `lineHeight: 19,` |
| 266 | fontSize | 12 | `fontSize: 12,` |

### screens/DeleteAccountScreen.tsx — 13

| Line | Property | Value | Context |
|---|---|---|---|
| 265 | fontSize | 16 | `fontSize: 16,` |
| 271 | fontSize | 14 | `fontSize: 14,` |
| 273 | lineHeight | 20 | `lineHeight: 20,` |
| 281 | marginTop | 7 | `marginTop: 7,` |
| 298 | fontSize | 15 | `fontSize: 15,` |
| 301 | lineHeight | 21 | `lineHeight: 21,` |
| 304 | fontSize | 13 | `fontSize: 13,` |
| 306 | lineHeight | 19 | `lineHeight: 19,` |
| 309 | gap | 2 | `gap: 2,` |
| 323 | fontSize | 11 | `fontSize: 11,` |
| 331 | fontSize | 15 | `fontSize: 15,` |
| 336 | fontSize | 13 | `fontSize: 13,` |
| 338 | lineHeight | 19 | `lineHeight: 19,` |

### screens/EarningsScreen.tsx — 11

| Line | Property | Value | Context |
|---|---|---|---|
| 199 | gap | 2 | `gap: 2,` |
| 206 | fontSize | 10 | `fontSize: 10,` |
| 212 | fontSize | 17 | `fontSize: 17,` |
| 218 | fontSize | 10 | `fontSize: 10,` |
| 233 | fontSize | 12 | `fontSize: 12,` |
| 235 | lineHeight | 17 | `lineHeight: 17,` |
| 253 | gap | 2 | `gap: 2,` |
| 256 | fontSize | 14 | `fontSize: 14,` |
| 261 | fontSize | 12 | `fontSize: 12,` |
| 265 | fontSize | 14 | `fontSize: 14,` |
| 267 | lineHeight | 20 | `lineHeight: 20,` |

### screens/HomeScreen.tsx — 48

| Line | Property | Value | Context |
|---|---|---|---|
| 541 | paddingHorizontal | 20 | `paddingHorizontal: 20,` |
| 543 | paddingBottom | 0 | `paddingBottom: 0,` |
| 544 | gap | 20 | `gap: 20,` |
| 554 | gap | 2 | `greetingBlock: { flexShrink: 1, gap: 2 },` |
| 555 | fontSize | 18 | `greeting: { fontSize: 18, fontWeight: '500', color: colors.homeSlate },` |
| 560 | gap | 7 | `gap: 7,` |
| 562 | paddingHorizontal | 13 | `paddingHorizontal: 13,` |
| 571 | fontSize | 15 | `modeSwitchText: { fontSize: 15, fontWeight: '600', color: colors.forest },` |
| 575 | fontSize | 39 | `fontSize: 39,` |
| 576 | lineHeight | 45 | `lineHeight: 45,` |
| 584 | fontSize | 16 | `fontSize: 16,` |
| 594 | paddingHorizontal | 18 | `paddingHorizontal: 18,` |
| 601 | fontSize | 17 | `searchInput: { flex: 1, fontSize: 17, color: colors.ink, paddingVertical: 0 },` |
| 601 | paddingVertical | 0 | `searchInput: { flex: 1, fontSize: 17, color: colors.ink, paddingVertical: 0 },` |
| 609 | paddingHorizontal | 10 | `compactServiceChip: { paddingHorizontal: 10 },` |
| 616 | borderRadius | 22 | `borderRadius: 22,` |
| 621 | padding | 16 | `heroBody: { padding: 16, gap: 12 },` |
| 621 | gap | 12 | `heroBody: { padding: 16, gap: 12 },` |
| 622 | gap | 4 | `heroCopy: { gap: 4, paddingRight: 68 },` |
| 622 | paddingRight | 68 | `heroCopy: { gap: 4, paddingRight: 68 },` |
| 623 | fontSize | 12 | `heroEyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.1, color: colors.gold },` |
| 626 | fontSize | 25 | `fontSize: 25,` |
| 627 | lineHeight | 29 | `lineHeight: 29,` |
| 642 | fontSize | 24 | `heroButtonText: { fontFamily: fonts.display, fontSize: 24, fontWeight: '700', color: color` |
| 643 | gap | 12 | `section: { gap: 12 },` |
| 644 | gap | 6 | `liveNearbyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-bet` |
| 646 | fontSize | 22 | `sectionTitle: { fontSize: 22, fontWeight: '700', color: colors.ink },` |
| 662 | paddingHorizontal | 10 | `paddingHorizontal: 10,` |
| 669 | fontSize | 14 | `mapPillText: { fontSize: 14, fontWeight: '600', color: colors.forest },` |
| 672 | fontSize | 15 | `viewAllText: { fontSize: 15, fontWeight: '600', color: colors.forest },` |
| 674 | borderRadius | 20 | `jobCard: { borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden', ...shado` |
| 676 | padding | 14 | `jobBody: { flexDirection: 'row', gap: spacing.md, padding: 14 },` |
| 681 | fontSize | 18 | `jobTitle: { flex: 1, fontSize: 18, lineHeight: 22, fontWeight: '700', color: colors.ink },` |
| 681 | lineHeight | 22 | `jobTitle: { flex: 1, fontSize: 18, lineHeight: 22, fontWeight: '700', color: colors.ink },` |
| 683 | fontSize | 11 | `jobPriceCaption: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: colors.home` |
| 684 | fontSize | 24 | `jobPrice: { fontSize: 24, fontWeight: '800', color: colors.forest },` |
| 686 | fontSize | 14 | `jobPlace: { flex: 1, fontSize: 14, color: colors.homeSlate },` |
| 690 | fontSize | 12 | `jobInterestText: { fontSize: 12, color: colors.homeSlate },` |
| 696 | paddingHorizontal | 14 | `paddingHorizontal: 14,` |
| 697 | paddingVertical | 10 | `paddingVertical: 10,` |
| 702 | fontSize | 13 | `demandText: { fontSize: 13, fontWeight: '600', color: colors.forest },` |
| 703 | fontSize | 13 | `jobMetaText: { flexShrink: 1, fontSize: 13, color: colors.homeSlate },` |
| 705 | fontSize | 14 | `noticeError: { fontSize: 14, color: colors.danger },` |
| 706 | fontSize | 14 | `retry: { fontSize: 14, fontWeight: '700', color: colors.forest },` |
| 707 | fontSize | 14 | `empty: { fontSize: 14, color: colors.homeSlate, lineHeight: 20 },` |
| 707 | lineHeight | 20 | `empty: { fontSize: 14, color: colors.homeSlate, lineHeight: 20 },` |
| 712 | padding | 14 | `padding: 14,` |
| 713 | borderRadius | 20 | `borderRadius: 20,` |

### screens/JobConfirmedScreen.tsx — 7

| Line | Property | Value | Context |
|---|---|---|---|
| 162 | gap | 2 | `gap: 2,` |
| 165 | fontSize | 17 | `fontSize: 17,` |
| 170 | fontSize | 13 | `fontSize: 13,` |
| 183 | fontSize | 13 | `fontSize: 13,` |
| 188 | fontSize | 14 | `fontSize: 14,` |
| 200 | fontSize | 12 | `fontSize: 12,` |
| 202 | lineHeight | 17 | `lineHeight: 17,` |

### screens/JobDetailScreen.tsx — 30

| Line | Property | Value | Context |
|---|---|---|---|
| 886 | gap | 0 | `gap: 0,` |
| 921 | fontSize | 13 | `fontSize: 13,` |
| 949 | gap | 2 | `gap: 2,` |
| 952 | fontSize | 15 | `fontSize: 15,` |
| 957 | fontSize | 13 | `fontSize: 13,` |
| 963 | gap | 5 | `gap: 5,` |
| 970 | fontSize | 12 | `fontSize: 12,` |
| 975 | fontSize | 30 | `fontSize: 30,` |
| 989 | fontSize | 16 | `fontSize: 16,` |
| 993 | fontSize | 16 | `fontSize: 16,` |
| 995 | lineHeight | 24 | `lineHeight: 24,` |
| 1015 | fontSize | 14 | `fontSize: 14,` |
| 1019 | fontSize | 17 | `fontSize: 17,` |
| 1036 | gap | 2 | `gap: 2,` |
| 1039 | fontSize | 16 | `fontSize: 16,` |
| 1044 | fontSize | 13 | `fontSize: 13,` |
| 1051 | fontSize | 24 | `fontSize: 24,` |
| 1056 | fontSize | 12 | `fontSize: 12,` |
| 1057 | lineHeight | 17 | `lineHeight: 17,` |
| 1061 | fontSize | 13 | `fontSize: 13,` |
| 1087 | gap | 2 | `gap: 2,` |
| 1090 | fontSize | 17 | `fontSize: 17,` |
| 1098 | fontSize | 15 | `fontSize: 15,` |
| 1108 | fontSize | 13 | `fontSize: 13,` |
| 1110 | lineHeight | 19 | `lineHeight: 19,` |
| 1130 | fontSize | 24 | `fontSize: 24,` |
| 1136 | fontSize | 14 | `fontSize: 14,` |
| 1142 | fontSize | 13 | `fontSize: 13,` |
| 1160 | fontSize | 18 | `fontSize: 18,` |
| 1166 | fontSize | 14 | `fontSize: 14,` |

### screens/LaunchScreen.tsx — 3

| Line | Property | Value | Context |
|---|---|---|---|
| 348 | paddingHorizontal | 24 | `paddingHorizontal: 24,` |
| 353 | marginTop | 20 | `marginTop: 20,` |
| 366 | marginTop | 8 | `marginTop: 8,` |

### screens/LegalDocumentScreen.tsx — 3

| Line | Property | Value | Context |
|---|---|---|---|
| 61 | fontSize | 14 | `fontSize: 14,` |
| 64 | lineHeight | 20 | `lineHeight: 20,` |
| 72 | fontSize | 11 | `fontSize: 11,` |

### screens/LegalGateScreen.tsx — 15

| Line | Property | Value | Context |
|---|---|---|---|
| 494 | gap | 2 | `gap: 2,` |
| 503 | marginTop | 2 | `marginTop: 2,` |
| 506 | fontSize | 23 | `fontSize: 23,` |
| 507 | lineHeight | 27 | `lineHeight: 27,` |
| 510 | fontSize | 14 | `fontSize: 14,` |
| 511 | lineHeight | 19 | `lineHeight: 19,` |
| 537 | paddingVertical | 5 | `paddingVertical: 5,` |
| 565 | gap | 1 | `gap: 1,` |
| 568 | fontSize | 15 | `fontSize: 15,` |
| 573 | fontSize | 12 | `fontSize: 12,` |
| 574 | lineHeight | 16 | `lineHeight: 16,` |
| 596 | fontSize | 11 | `fontSize: 11,` |
| 608 | gap | 4 | `gap: 4,` |
| 610 | paddingVertical | 6 | `paddingVertical: 6,` |
| 660 | fontSize | 14 | `fontSize: 14,` |

### screens/MapScreen.tsx — 6

| Line | Property | Value | Context |
|---|---|---|---|
| 162 | fontSize | 14 | `fontSize: 14,` |
| 192 | fontSize | 12 | `fontSize: 12,` |
| 223 | fontSize | 17 | `fontSize: 17,` |
| 227 | fontSize | 14 | `fontSize: 14,` |
| 236 | fontSize | 14 | `fontSize: 14,` |
| 245 | fontSize | 14 | `fontSize: 14,` |

### screens/MessagesInboxScreen.tsx — 7

| Line | Property | Value | Context |
|---|---|---|---|
| 432 | paddingBottom | 0 | `paddingBottom: 0,` |
| 442 | paddingBottom | 0 | `paddingBottom: 0,` |
| 459 | borderRadius | 36 | `borderRadius: 36,` |
| 466 | fontSize | 18 | `fontSize: 18,` |
| 471 | fontSize | 14 | `fontSize: 14,` |
| 474 | lineHeight | 20 | `lineHeight: 20,` |
| 481 | fontSize | 14 | `fontSize: 14,` |

### screens/MyJobsHubScreen.tsx — 27

| Line | Property | Value | Context |
|---|---|---|---|
| 543 | gap | 2 | `gap: 2,` |
| 546 | fontSize | 11 | `fontSize: 11,` |
| 552 | fontSize | 28 | `fontSize: 28,` |
| 553 | lineHeight | 32 | `lineHeight: 32,` |
| 558 | fontSize | 13 | `fontSize: 13,` |
| 559 | lineHeight | 18 | `lineHeight: 18,` |
| 569 | gap | 3 | `gap: 3,` |
| 570 | padding | 3 | `padding: 3,` |
| 591 | fontSize | 12 | `fontSize: 12,` |
| 606 | fontSize | 14 | `fontSize: 14,` |
| 614 | paddingBottom | 0 | `paddingBottom: 0,` |
| 626 | fontSize | 14 | `fontSize: 14,` |
| 642 | fontSize | 12 | `fontSize: 12,` |
| 659 | borderRadius | 36 | `borderRadius: 36,` |
| 666 | fontSize | 20 | `fontSize: 20,` |
| 671 | fontSize | 14 | `fontSize: 14,` |
| 689 | fontSize | 16 | `fontSize: 16,` |
| 716 | gap | 2 | `gap: 2,` |
| 719 | fontSize | 10 | `fontSize: 10,` |
| 725 | fontSize | 15 | `fontSize: 15,` |
| 730 | fontSize | 12 | `fontSize: 12,` |
| 754 | fontSize | 15 | `fontSize: 15,` |
| 779 | gap | 2 | `gap: 2,` |
| 782 | fontSize | 14 | `fontSize: 14,` |
| 787 | fontSize | 12 | `fontSize: 12,` |
| 788 | lineHeight | 16 | `lineHeight: 16,` |
| 801 | fontSize | 14 | `fontSize: 14,` |

### screens/NotificationSettingsScreen.tsx — 14

| Line | Property | Value | Context |
|---|---|---|---|
| 325 | fontSize | 13 | `fontSize: 13,` |
| 326 | lineHeight | 18 | `lineHeight: 18,` |
| 330 | fontSize | 13 | `fontSize: 13,` |
| 331 | lineHeight | 18 | `lineHeight: 18,` |
| 347 | gap | 2 | `gap: 2,` |
| 350 | fontSize | 15 | `fontSize: 15,` |
| 355 | fontSize | 12 | `fontSize: 12,` |
| 356 | lineHeight | 17 | `lineHeight: 17,` |
| 360 | fontSize | 15 | `fontSize: 15,` |
| 365 | fontSize | 12 | `fontSize: 12,` |
| 366 | lineHeight | 17 | `lineHeight: 17,` |
| 374 | fontSize | 14 | `fontSize: 14,` |
| 386 | fontSize | 12 | `fontSize: 12,` |
| 387 | lineHeight | 17 | `lineHeight: 17,` |

### screens/NotificationsScreen.tsx — 8

| Line | Property | Value | Context |
|---|---|---|---|
| 195 | fontSize | 13 | `fontSize: 13,` |
| 219 | gap | 2 | `gap: 2,` |
| 222 | fontSize | 14 | `fontSize: 14,` |
| 230 | fontSize | 13 | `fontSize: 13,` |
| 232 | lineHeight | 18 | `lineHeight: 18,` |
| 235 | fontSize | 11 | `fontSize: 11,` |
| 241 | borderRadius | 4 | `borderRadius: 4,` |
| 243 | marginTop | 6 | `marginTop: 6,` |

### screens/PaymentMethodsScreen.tsx — 8

| Line | Property | Value | Context |
|---|---|---|---|
| 97 | gap | 4 | `gap: 4,` |
| 100 | fontSize | 16 | `fontSize: 16,` |
| 105 | fontSize | 13 | `fontSize: 13,` |
| 107 | lineHeight | 19 | `lineHeight: 19,` |
| 110 | fontSize | 14 | `fontSize: 14,` |
| 112 | lineHeight | 20 | `lineHeight: 20,` |
| 124 | fontSize | 13 | `fontSize: 13,` |
| 126 | lineHeight | 19 | `lineHeight: 19,` |

### screens/PostJobScreen.tsx — 29

| Line | Property | Value | Context |
|---|---|---|---|
| 1472 | fontSize | 12 | `fontSize: 12,` |
| 1478 | fontSize | 28 | `fontSize: 28,` |
| 1479 | lineHeight | 34 | `lineHeight: 34,` |
| 1484 | fontSize | 14 | `fontSize: 14,` |
| 1485 | lineHeight | 20 | `lineHeight: 20,` |
| 1507 | fontSize | 11 | `fontSize: 11,` |
| 1530 | fontSize | 13 | `fontSize: 13,` |
| 1533 | lineHeight | 19 | `lineHeight: 19,` |
| 1544 | fontSize | 13 | `fontSize: 13,` |
| 1549 | fontSize | 12 | `fontSize: 12,` |
| 1551 | lineHeight | 17 | `lineHeight: 17,` |
| 1610 | fontSize | 13 | `fontSize: 13,` |
| 1611 | lineHeight | 19 | `lineHeight: 19,` |
| 1624 | fontSize | 11 | `fontSize: 11,` |
| 1630 | fontSize | 20 | `fontSize: 20,` |
| 1631 | lineHeight | 25 | `lineHeight: 25,` |
| 1636 | fontSize | 14 | `fontSize: 14,` |
| 1637 | lineHeight | 20 | `lineHeight: 20,` |
| 1659 | gap | 2 | `gap: 2,` |
| 1662 | fontSize | 11 | `fontSize: 11,` |
| 1669 | fontSize | 14 | `fontSize: 14,` |
| 1670 | lineHeight | 19 | `lineHeight: 19,` |
| 1681 | fontSize | 13 | `fontSize: 13,` |
| 1682 | lineHeight | 19 | `lineHeight: 19,` |
| 1729 | fontSize | 12 | `fontSize: 12,` |
| 1735 | fontSize | 28 | `fontSize: 28,` |
| 1736 | lineHeight | 34 | `lineHeight: 34,` |
| 1743 | fontSize | 15 | `fontSize: 15,` |
| 1744 | lineHeight | 22 | `lineHeight: 22,` |

### screens/ProfileReviewsScreen.tsx — 16

| Line | Property | Value | Context |
|---|---|---|---|
| 266 | fontSize | 14 | `fontSize: 14,` |
| 291 | borderRadius | 36 | `borderRadius: 36,` |
| 298 | fontSize | 18 | `fontSize: 18,` |
| 303 | fontSize | 14 | `fontSize: 14,` |
| 306 | lineHeight | 20 | `lineHeight: 20,` |
| 317 | fontSize | 40 | `fontSize: 40,` |
| 325 | fontSize | 13 | `fontSize: 13,` |
| 338 | fontSize | 12 | `fontSize: 12,` |
| 346 | borderRadius | 3 | `borderRadius: 3,` |
| 356 | fontSize | 12 | `fontSize: 12,` |
| 362 | gap | 0 | `gap: 0,` |
| 371 | gap | 2 | `gap: 2,` |
| 374 | fontSize | 15 | `fontSize: 15,` |
| 379 | fontSize | 12 | `fontSize: 12,` |
| 383 | fontSize | 14 | `fontSize: 14,` |
| 385 | lineHeight | 20 | `lineHeight: 20,` |

### screens/ProfileScreen.tsx — 16

| Line | Property | Value | Context |
|---|---|---|---|
| 831 | paddingBottom | 0 | `paddingBottom: 0,` |
| 847 | borderRadius | 15 | `borderRadius: 15,` |
| 855 | fontSize | 15 | `fontSize: 15,` |
| 861 | fontSize | 13 | `fontSize: 13,` |
| 867 | gap | 2 | `gap: 2,` |
| 874 | fontSize | 13 | `fontSize: 13,` |
| 888 | fontSize | 16 | `fontSize: 16,` |
| 895 | fontSize | 13 | `fontSize: 13,` |
| 925 | borderRadius | 14 | `borderRadius: 14,` |
| 938 | fontSize | 15 | `fontSize: 15,` |
| 953 | fontSize | 15 | `fontSize: 15,` |
| 958 | fontSize | 17 | `fontSize: 17,` |
| 975 | fontSize | 15 | `fontSize: 15,` |
| 990 | fontSize | 14 | `fontSize: 14,` |
| 1003 | fontSize | 11 | `fontSize: 11,` |
| 1016 | fontSize | 16 | `fontSize: 16,` |

### screens/ReviewAndTipScreen.tsx — 6

| Line | Property | Value | Context |
|---|---|---|---|
| 351 | fontSize | 11 | `fontSize: 11,` |
| 357 | fontSize | 16 | `fontSize: 16,` |
| 370 | fontSize | 13 | `fontSize: 13,` |
| 372 | lineHeight | 19 | `lineHeight: 19,` |
| 403 | fontSize | 15 | `fontSize: 15,` |
| 416 | fontSize | 15 | `fontSize: 15,` |

### screens/RouteArrivalScreen.tsx — 12

| Line | Property | Value | Context |
|---|---|---|---|
| 257 | fontSize | 11 | `fontSize: 11,` |
| 263 | fontSize | 20 | `fontSize: 20,` |
| 268 | fontSize | 13 | `fontSize: 13,` |
| 270 | lineHeight | 19 | `lineHeight: 19,` |
| 287 | gap | 2 | `gap: 2,` |
| 291 | fontSize | 14 | `fontSize: 14,` |
| 294 | lineHeight | 20 | `lineHeight: 20,` |
| 297 | fontSize | 12 | `fontSize: 12,` |
| 299 | lineHeight | 17 | `lineHeight: 17,` |
| 312 | borderRadius | 14 | `borderRadius: 14,` |
| 325 | gap | 2 | `gap: 2,` |
| 328 | fontSize | 15 | `fontSize: 15,` |

### screens/SavedWorkersScreen.tsx — 4

| Line | Property | Value | Context |
|---|---|---|---|
| 204 | gap | 2 | `gap: 2,` |
| 207 | fontSize | 15 | `fontSize: 15,` |
| 212 | fontSize | 12 | `fontSize: 12,` |
| 226 | fontSize | 13 | `fontSize: 13,` |

### screens/ServicesPricingScreen.tsx — 12

| Line | Property | Value | Context |
|---|---|---|---|
| 323 | fontSize | 16 | `fontSize: 16,` |
| 328 | fontSize | 13 | `fontSize: 13,` |
| 330 | lineHeight | 19 | `lineHeight: 19,` |
| 339 | gap | 4 | `gap: 4,` |
| 348 | fontSize | 16 | `fontSize: 16,` |
| 368 | gap | 2 | `gap: 2,` |
| 371 | fontSize | 15 | `fontSize: 15,` |
| 376 | fontSize | 12 | `fontSize: 12,` |
| 385 | fontSize | 15 | `fontSize: 15,` |
| 408 | fontSize | 14 | `fontSize: 14,` |
| 430 | fontSize | 12 | `fontSize: 12,` |
| 448 | fontSize | 15 | `fontSize: 15,` |

### screens/SetupScreen.tsx — 2

| Line | Property | Value | Context |
|---|---|---|---|
| 419 | fontSize | 19 | `fontSize: 19,` |
| 463 | fontSize | 14 | `fontSize: 14,` |

### screens/SubmitBidScreen.tsx — 3

| Line | Property | Value | Context |
|---|---|---|---|
| 117 | fontSize | 20 | `fontSize: 20,` |
| 123 | fontSize | 14 | `fontSize: 14,` |
| 126 | lineHeight | 20 | `lineHeight: 20,` |

### screens/TrackWorkerScreen.tsx — 11

| Line | Property | Value | Context |
|---|---|---|---|
| 233 | fontSize | 13 | `fontSize: 13,` |
| 235 | lineHeight | 19 | `lineHeight: 19,` |
| 238 | gap | 0 | `gap: 0,` |
| 251 | borderRadius | 11 | `borderRadius: 11,` |
| 277 | gap | 2 | `gap: 2,` |
| 280 | fontSize | 15 | `fontSize: 15,` |
| 288 | fontSize | 12 | `fontSize: 12,` |
| 303 | fontSize | 14 | `fontSize: 14,` |
| 316 | fontSize | 11 | `fontSize: 11,` |
| 322 | fontSize | 13 | `fontSize: 13,` |
| 324 | lineHeight | 19 | `lineHeight: 19,` |

### screens/VerifyPhoneScreen.tsx — 3

| Line | Property | Value | Context |
|---|---|---|---|
| 482 | borderRadius | 23 | `borderRadius: 23,` |
| 514 | gap | 4 | `gap: 4,` |
| 561 | fontSize | 14 | `fontSize: 14,` |

### screens/WelcomeScreen.tsx — 4

| Line | Property | Value | Context |
|---|---|---|---|
| 239 | gap | 7 | `gap: 7,` |
| 244 | paddingLeft | 12 | `paddingLeft: 12,` |
| 245 | paddingRight | 14 | `paddingRight: 14,` |
| 246 | paddingVertical | 10 | `paddingVertical: 10,` |

### screens/WorkChecklistScreen.tsx — 9

| Line | Property | Value | Context |
|---|---|---|---|
| 244 | fontSize | 14 | `fontSize: 14,` |
| 249 | fontSize | 12 | `fontSize: 12,` |
| 263 | fontSize | 16 | `fontSize: 16,` |
| 268 | fontSize | 13 | `fontSize: 13,` |
| 271 | lineHeight | 19 | `lineHeight: 19,` |
| 297 | borderRadius | 8 | `borderRadius: 8,` |
| 310 | fontSize | 15 | `fontSize: 15,` |
| 313 | lineHeight | 21 | `lineHeight: 21,` |
| 331 | fontSize | 15 | `fontSize: 15,` |

### screens/WorkerHomeScreen.tsx — 26

| Line | Property | Value | Context |
|---|---|---|---|
| 376 | paddingBottom | 0 | `paddingBottom: 0,` |
| 385 | gap | 2 | `greetingBlock: { flexShrink: 1, gap: 2 },` |
| 386 | fontSize | 15 | `greeting: { fontSize: 15, fontWeight: '600', color: colors.textMuted },` |
| 389 | fontSize | 28 | `fontSize: 28,` |
| 390 | lineHeight | 33 | `lineHeight: 33,` |
| 398 | gap | 7 | `gap: 7,` |
| 400 | paddingHorizontal | 13 | `paddingHorizontal: 13,` |
| 407 | fontSize | 15 | `modeSwitchText: { fontSize: 15, fontWeight: '600', color: colors.forest },` |
| 414 | paddingHorizontal | 16 | `paddingHorizontal: 16,` |
| 423 | fontSize | 16 | `fontSize: 16,` |
| 425 | paddingVertical | 0 | `paddingVertical: 0,` |
| 443 | gap | 2 | `availabilityCopy: { flex: 1, gap: 2 },` |
| 444 | fontSize | 16 | `cardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },` |
| 445 | fontSize | 12 | `cardNote: { fontSize: 12, lineHeight: 17, color: colors.textMuted },` |
| 445 | lineHeight | 17 | `cardNote: { fontSize: 12, lineHeight: 17, color: colors.textMuted },` |
| 450 | gap | 2 | `gap: 2,` |
| 454 | fontSize | 11 | `fontSize: 11,` |
| 459 | fontSize | 32 | `earningsAmount: { fontSize: 32, fontWeight: '800', color: colors.white },` |
| 460 | fontSize | 13 | `earningsCaption: { fontSize: 13, color: colors.mint },` |
| 476 | fontSize | 13 | `pillText: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: colors.forest },` |
| 483 | fontSize | 20 | `sectionTitle: { fontSize: 20, fontWeight: '800', color: colors.ink },` |
| 492 | fontSize | 15 | `viewAllText: { fontSize: 15, fontWeight: '600', color: colors.forest },` |
| 495 | fontSize | 14 | `noticeError: { fontSize: 14, color: colors.danger },` |
| 496 | fontSize | 14 | `retry: { fontSize: 14, fontWeight: '700', color: colors.forest },` |
| 497 | fontSize | 14 | `empty: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },` |
| 497 | lineHeight | 20 | `empty: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },` |

### screens/WorkerJobScreen.tsx — 16

| Line | Property | Value | Context |
|---|---|---|---|
| 625 | fontSize | 11 | `fontSize: 11,` |
| 631 | fontSize | 13 | `fontSize: 13,` |
| 633 | lineHeight | 19 | `lineHeight: 19,` |
| 670 | gap | 2 | `gap: 2,` |
| 673 | fontSize | 17 | `fontSize: 17,` |
| 678 | fontSize | 13 | `fontSize: 13,` |
| 691 | fontSize | 16 | `fontSize: 16,` |
| 696 | fontSize | 13 | `fontSize: 13,` |
| 700 | fontSize | 17 | `fontSize: 17,` |
| 705 | fontSize | 14 | `fontSize: 14,` |
| 708 | lineHeight | 20 | `lineHeight: 20,` |
| 729 | fontSize | 14 | `fontSize: 14,` |
| 741 | fontSize | 13 | `fontSize: 13,` |
| 762 | borderRadius | 15 | `borderRadius: 15,` |
| 786 | fontSize | 14 | `fontSize: 14,` |
| 794 | fontSize | 14 | `fontSize: 14,` |

### screens/WorkerProfileScreen.tsx — 21

| Line | Property | Value | Context |
|---|---|---|---|
| 372 | fontSize | 14 | `fontSize: 14,` |
| 374 | lineHeight | 20 | `lineHeight: 20,` |
| 380 | fontSize | 16 | `fontSize: 16,` |
| 395 | gap | 2 | `gap: 2,` |
| 398 | fontSize | 15 | `fontSize: 15,` |
| 403 | fontSize | 12 | `fontSize: 12,` |
| 405 | lineHeight | 17 | `lineHeight: 17,` |
| 408 | fontSize | 14 | `fontSize: 14,` |
| 423 | fontSize | 14 | `fontSize: 14,` |
| 426 | lineHeight | 20 | `lineHeight: 20,` |
| 443 | gap | 4 | `gap: 4,` |
| 452 | fontSize | 20 | `fontSize: 20,` |
| 459 | gap | 4 | `gap: 4,` |
| 466 | fontSize | 14 | `fontSize: 14,` |
| 471 | fontSize | 13 | `fontSize: 13,` |
| 475 | fontSize | 15 | `fontSize: 15,` |
| 477 | lineHeight | 21 | `lineHeight: 21,` |
| 493 | fontSize | 12 | `fontSize: 12,` |
| 501 | fontSize | 17 | `fontSize: 17,` |
| 506 | fontSize | 14 | `fontSize: 14,` |
| 508 | lineHeight | 20 | `lineHeight: 20,` |

### screens/WorkerResultsScreen.tsx — 8

| Line | Property | Value | Context |
|---|---|---|---|
| 349 | borderRadius | 36 | `borderRadius: 36,` |
| 356 | fontSize | 18 | `fontSize: 18,` |
| 361 | fontSize | 14 | `fontSize: 14,` |
| 364 | lineHeight | 20 | `lineHeight: 20,` |
| 378 | borderRadius | 8 | `borderRadius: 8,` |
| 382 | paddingHorizontal | 3 | `paddingHorizontal: 3,` |
| 385 | fontSize | 10 | `fontSize: 10,` |
| 397 | fontSize | 15 | `fontSize: 15,` |

### screens/WorkerSearchScreen.tsx — 26

| Line | Property | Value | Context |
|---|---|---|---|
| 525 | fontSize | 11 | `fontSize: 11,` |
| 532 | fontSize | 31 | `fontSize: 31,` |
| 533 | lineHeight | 37 | `lineHeight: 37,` |
| 539 | fontSize | 14 | `fontSize: 14,` |
| 540 | lineHeight | 20 | `lineHeight: 20,` |
| 558 | fontSize | 16 | `fontSize: 16,` |
| 561 | paddingVertical | 0 | `paddingVertical: 0,` |
| 596 | fontSize | 14 | `fontSize: 14,` |
| 602 | fontSize | 12 | `fontSize: 12,` |
| 643 | fontSize | 11 | `fontSize: 11,` |
| 653 | fontSize | 25 | `fontSize: 25,` |
| 654 | lineHeight | 31 | `lineHeight: 31,` |
| 661 | fontSize | 14 | `fontSize: 14,` |
| 664 | lineHeight | 21 | `lineHeight: 21,` |
| 689 | fontSize | 11 | `fontSize: 11,` |
| 696 | fontSize | 26 | `fontSize: 26,` |
| 697 | lineHeight | 32 | `lineHeight: 32,` |
| 703 | fontSize | 13 | `fontSize: 13,` |
| 704 | lineHeight | 19 | `lineHeight: 19,` |
| 721 | fontSize | 10 | `fontSize: 10,` |
| 733 | fontSize | 18 | `fontSize: 18,` |
| 744 | fontSize | 13 | `fontSize: 13,` |
| 750 | fontSize | 13 | `fontSize: 13,` |
| 763 | fontSize | 13 | `fontSize: 13,` |
| 764 | lineHeight | 18 | `lineHeight: 18,` |
| 787 | fontSize | 14 | `fontSize: 14,` |

### ui/primitives/BottomNav.tsx — 2

| Line | Property | Value | Context |
|---|---|---|---|
| 350 | marginTop | 2 | `marginTop: 2,` |
| 392 | padding | 5 | `padding: 5,` |

### ui/primitives/JobCard.tsx — 10

| Line | Property | Value | Context |
|---|---|---|---|
| 228 | gap | 3 | `gap: 3,` |
| 232 | fontSize | 16 | `fontSize: 16,` |
| 233 | lineHeight | 21 | `lineHeight: 21,` |
| 238 | fontSize | 13 | `fontSize: 13,` |
| 245 | marginTop | 2 | `marginTop: 2,` |
| 250 | gap | 3 | `gap: 3,` |
| 253 | paddingVertical | 2 | `paddingVertical: 2,` |
| 264 | gap | 3 | `gap: 3,` |
| 267 | paddingVertical | 2 | `paddingVertical: 2,` |
| 289 | fontSize | 16 | `fontSize: 16,` |

### ui/primitives/ListRow.tsx — 1

| Line | Property | Value | Context |
|---|---|---|---|
| 101 | gap | 2 | `gap: 2,` |

### ui/primitives/MediaGrid.tsx — 2

| Line | Property | Value | Context |
|---|---|---|---|
| 127 | gap | 3 | `gap: 3,` |
| 129 | paddingVertical | 2 | `paddingVertical: 2,` |

### ui/primitives/MediaUploader.tsx — 1

| Line | Property | Value | Context |
|---|---|---|---|
| 222 | gap | 2 | `gap: 2,` |

### ui/primitives/SearchBar.tsx — 1

| Line | Property | Value | Context |
|---|---|---|---|
| 123 | paddingVertical | 0 | `paddingVertical: 0,` |

## 1b-def. Numeric literals in token-definition files

### lib/theme.ts — 6

| Line | Property | Value |
|---|---|---|
| 182 | fontSize | 28 |
| 183 | fontSize | 22 |
| 184 | fontSize | 17 |
| 185 | fontSize | 15 |
| 186 | fontSize | 13 |
| 187 | fontSize | 12 |

### ui/tokens.ts — 9

| Line | Property | Value |
|---|---|---|
| 180 | fontSize | 28 |
| 180 | lineHeight | 29 |
| 181 | fontSize | 26 |
| 182 | fontSize | 21 |
| 183 | fontSize | 15 |
| 184 | fontSize | 14 |
| 185 | fontSize | 11 |
| 186 | fontSize | 10 |
| 188 | fontSize | 9 |

## 1c. Direct ui/tokens imports

| File | Line | Import |
|---|---|---|
| lib/theme.ts | 2 | `import { brand } from '../ui/tokens';` |
| lib/authTheme.ts | 2 | `import { brand } from '../ui/tokens';` |

---

## 2. Screen-state coverage

### Canonical state surface

| Export / variant | Location | Notes |
|---|---|---|
| `ScreenState` type (kinds: `ready`, `loading`, `empty`, `error`, `offline`, `permissionDenied`) | `ui/templates/ScreenStates.tsx:21-54` | `loading` takes `variant: 'skeleton' \| 'spinner'` + `rows`; `empty`/`permissionDenied` take title/body/action; `error`/`offline` take `onRetry` |
| `isReady(state)` | `ui/templates/ScreenStates.tsx:56-58` | `undefined` or `kind:'ready'` counts as ready |
| `ScreenStateView` — loading (spinner) | `ui/templates/ScreenStates.tsx:63-68` | `ActivityIndicator` |
| `ScreenStateView` — loading (skeleton, default) | `ui/templates/ScreenStates.tsx:70-76` | `Skeleton` rows (default 4) |
| `ScreenStateView` — empty | `ui/templates/ScreenStates.tsx:78-87` | `EmptyState`, default "Nothing here yet" |
| `ScreenStateView` — error | `ui/templates/ScreenStates.tsx:89-99` | `EmptyState` tone attention, "Try again" if `onRetry` |
| `ScreenStateView` — offline | `ui/templates/ScreenStates.tsx:101-111` | `EmptyState`, "You are offline" |
| `ScreenStateView` — permissionDenied | `ui/templates/ScreenStates.tsx:113-125` | `EmptyState`, default "Open Settings" action |
| Indirect: `ListScreen` renders `ScreenStateView` when `!isReady(state)` | `ui/templates/ListScreen.tsx:100-101` | `state` prop at `ListScreen.tsx:50`; no screen uses `ListScreen` (verified by grep — only `ui/templates/index.ts` and the dev catalog reference it) |
| Indirect: `DetailScreen` renders `ScreenStateView` | `ui/templates/DetailScreen.tsx:60-61` | `state` prop at `DetailScreen.tsx:40` |
| Indirect: `FormScreen` renders `ScreenStateView` | `ui/templates/FormScreen.tsx:87-88` | `state` prop at `FormScreen.tsx:55` |
| `SuccessScreen` — no `state` prop, never renders ScreenStates | `ui/templates/SuccessScreen.tsx:28-45` | confirmation-only template |
| Re-exports | `ui/templates/index.ts:14-22` | |

### Per-screen coverage (one row per screen; line numbers refer to the named file)

| Screen | Loading | Empty | Error | Offline | Permission-denied |
|---|---|---|---|---|---|
| AdminReportsScreen | ad hoc: ActivityIndicator L124-127 | ad hoc: "Nothing to review" L200-214 | ad hoc: inline error Text L122 | absent | absent |
| ApproveOrDisputeScreen | ScreenStates via FormScreen (spinner L119, state prop L220) | ScreenStates (missing L97-103; not-completed L111-117) | ScreenStates (retry L121) | absent | ScreenStates (not owner L105-109) |
| AuthFlow | absent | absent | absent | absent | absent — stack navigator only, L19-40 |
| BidDetailScreen | ScreenStates via DetailScreen (skeleton L64-65, state prop L128) | ScreenStates ("bid no longer here" L69-75) | ScreenStates (retry L66-67) | absent | absent |
| BidSentScreen | absent | absent | absent | absent | absent — SuccessScreen template, route params only, L20-54 |
| BrowseJobsScreen | ad hoc: WorkerJobCardSkeleton ×3 L385-394 | ad hoc: "No open jobs right now" L413-423 | ad hoc: inline error Text L358 | absent | ad hoc: nearby pill relabels "Enable location" L209-210 |
| CellJobsScreen | ad hoc: ActivityIndicator L104-107 | ad hoc: "No jobs here anymore" L126-136 | ad hoc: inline error Text L102 | absent | absent |
| ChatScreen | ad hoc: ActivityIndicator L968-971 | ad hoc: "Say hello" L1092-1103 | ad hoc: inline error Text L954 | absent | ad hoc: alertAsync "Camera access needed" L881-884 (dialog only) |
| CheckoutScreen | ScreenStates via DetailScreen (spinner L110-111, state prop L168) | ScreenStates (missing L84-89; nothing to check out L103-109) | ScreenStates (retry L112-117) | absent | ScreenStates (payments off L91-95; not owner L97-101) |
| ClientJobDetailScreen | ad hoc: ActivityIndicator + "Loading bids…" L554-558 | ad hoc: "No bids yet" L576-589; missing-job screen L337-362 | ad hoc: banner + Retry L532-551; "Couldn't load bids" L559-575; workerError banner L697-714 | absent | absent |
| CompareBidsScreen | ScreenStates via DetailScreen (skeleton L53-54, state prop L70) | ScreenStates L57-62 | ScreenStates (retry L55-56) | absent | absent |
| CounterofferScreen | absent (submit spinner in OfferComposer only, `components/OfferComposer.tsx:266`) | absent | ad hoc: alertAsync in OfferComposer (`components/OfferComposer.tsx:157,169,172`) | absent | absent |
| CreateAccountScreen | ad hoc: AuthButton loading L161 | absent | ad hoc: field errors L118, L138; AuthNotice L144 | absent | absent |
| DeleteAccountScreen | ScreenStates via FormScreen (spinner L142, state prop L140-146) | absent | ScreenStates (retry L144) | absent | absent |
| EarningsScreen | ScreenStates via DetailScreen (spinner L78, state prop L89) | ad hoc: ledger "Nothing yet" Text L119-123 | ScreenStates (retry L76) | absent | ScreenStates (signed-out L74) |
| EmailCreateAccountScreen | ad hoc: AuthButton loading L198 | absent | ad hoc: formError box L183-187; field errors L118, L138, L152, L173 | absent | absent |
| EmailSignInScreen | ad hoc: AuthButton loading L133 | absent | ad hoc: formError box L125-129; field errors L95, L115 | absent | ad hoc: banned-account AuthNotice L77-84 |
| HomeScreen | ad hoc: Skeleton card L374-383 | ad hoc: inline Text L391-394 | ad hoc: "Couldn't load open jobs." + Try again L384-390 | absent | absent |
| JobConfirmedScreen | ScreenStates via DetailScreen (spinner L72-73, state prop L89) | ScreenStates ("Not confirmed yet" L76-84) | ScreenStates (retry L74-75) | absent | absent |
| JobDetailScreen | ad hoc: ActivityIndicator L581-582 | ad hoc: missing-job block L426-440 | ad hoc: alertAsync dialogs L283, L353, L374, L401; refresh errors console-only L200, L211 | absent | absent |
| LaunchScreen | ad hoc: the screen IS the boot loading overlay (held until `sessionReady`, L131-155) | absent | absent | absent | absent |
| LegalDocumentScreen | absent (static local data, L22) | ad hoc: missing-document fallback L24-36 | absent | absent | absent |
| LegalGateScreen | ad hoc: AuthButton loading={saving} L350-359 | absent | ad hoc: inline error Text L344-348 (set L209-216) | absent | absent |
| MapScreen | ad hoc: HotspotMap perm spinner (`components/HotspotMap.native.tsx:91-102`) + "Updating hotspots…" pill (`:179-191`; prop at MapScreen L101) | ad hoc: HotspotMap empty banner (`components/HotspotMap.native.tsx:193-203`) | ad hoc: banner + "Try again" L73-82 | absent | ad hoc: HotspotMap "Location is off" + Open Settings (`components/HotspotMap.native.tsx:104-125`) |
| MessagesInboxScreen | ad hoc: ActivityIndicator L321-324 | ad hoc: "No messages yet" L376-386 | ad hoc: inline error Text L319 | absent | absent |
| MyJobsHubScreen | ad hoc L258-262 | ad hoc L297-316 | ad hoc L276-295 | absent | absent |
| NotificationSettingsScreen | ad hoc L177-180 | absent | ad hoc L183-193 | absent | ad hoc L161-167 (rendered L194-208) |
| NotificationsScreen | ScreenStates L120-121 via DetailScreen L133-137 | ScreenStates L122-129 | ScreenStates L118-119 | absent | ScreenStates L116-117 |
| OnboardingFlow | absent | absent | absent | absent | absent — pure navigator |
| PaymentMethodsScreen | absent | absent | absent | absent | absent — static; `state:{kind:'ready'}` L22 |
| PostJobScreen | ad hoc L841-844 | absent | ad hoc L396-414, L709-719 (dialogs only) | absent | absent |
| ProfileReviewsScreen | ad hoc L116-119 | ad hoc L175-186 | ad hoc L120-129 | absent | absent |
| ProfileScreen | ad hoc L406-409 | absent | ad hoc L288-289 (save dialog only; `useProfile` load error unused — destructure L58) | absent | absent |
| ReviewAndTipScreen | ScreenStates L165-166 via ScreenStateView L191-192 | ScreenStates L144-149, L158-164, L173-180 | ScreenStates L167-171 | absent | ScreenStates L151-156 |
| RouteArrivalScreen | ScreenStates L67-68 via DetailScreen L104-108 | ScreenStates L71-78 | ScreenStates L69-70 | absent | ScreenStates L79-84 |
| SavedWorkersScreen | ScreenStates L87-88 via DetailScreen L155-158 | ScreenStates L91-98 | ScreenStates L89-90 | absent | ScreenStates L85-86 |
| ServicesPricingScreen | ScreenStates L77-78 via FormScreen L156-159 | ad hoc L202-206 | ScreenStates L79-80 | absent | ScreenStates L75-76 |
| SetupScreen | ad hoc L364-366, L272-277 | absent | ad hoc L262-266 (set L167) | absent | ad hoc L340-345 |
| SignInScreen | ad hoc L132-136 | absent | ad hoc L113-123, L128 | absent | ad hoc L103-110 |
| SubmitBidScreen | ad hoc: OfferComposer submit `loading` (`components/OfferComposer.tsx:266`) | absent | ad hoc: alertAsync in OfferComposer (`components/OfferComposer.tsx:157,172`) | absent | ad hoc L34-54 |
| TrackWorkerScreen | absent (job seeded from route param; `useOwnedJobDetail` has no loading phase) | ScreenStates L84-91, L97-105 | absent (payment/dispute/profile fetch errors swallowed L55-63) | absent | ScreenStates L92-96 |
| VerifyPhoneScreen | ad hoc L358-364, L383 | absent | ad hoc L348-356; stale view L306-311 (L442-467) | absent | absent |
| WelcomeScreen | absent | absent | absent | absent | absent — static marketing |
| WorkChecklistScreen | ScreenStates L64-65 via FormScreen L144-149 | ScreenStates L70-77; ad hoc L183-191 | ScreenStates L66-69 | absent | ScreenStates L78-83 |
| WorkerHomeScreen | ad hoc L334-338 | ad hoc L346-349 | ad hoc L339-345 | absent | ad hoc L182-184 |
| WorkerJobScreen | ad hoc L319-322 | ad hoc L323-324 | ad hoc L317 | absent | ad hoc L416-422 |
| WorkerProfileScreen | ad hoc L171-174 | absent | ad hoc L175-179 | absent | absent |
| WorkerResultsScreen | ad hoc L209-214 | ad hoc L242-279 | ad hoc L273 + L299 (recovery: pull-to-refresh L231-241) | absent | ad hoc L273-276 + L300, L313 |
| WorkerSearchScreen | ad hoc L281-289 | ad hoc L308-316, L317-332 | ad hoc L290-307 | absent | absent |

**Offline:** 0 of 49 screens render a distinct offline state. The
`kind:'offline'` variant at `ScreenStates.tsx:101-111` has no consumer;
no screen constructs `{ kind: 'offline' }`; network failures fall into
generic error paths where those exist.

### Ad-hoc implementations, named

- AdminReportsScreen, loading — inline `<ActivityIndicator size="large">` in centered View — `screens/AdminReportsScreen.tsx:124-127`
- AdminReportsScreen, empty — FlatList `ListEmptyComponent`: icon circle + "Nothing to review" — `screens/AdminReportsScreen.tsx:200-214`
- AdminReportsScreen, error — inline `<Text style={styles.error}>{error}</Text>` banner (no retry control; alertAsync on action failures L86, L97, L108) — `screens/AdminReportsScreen.tsx:122`
- BrowseJobsScreen, loading — 3× `WorkerJobCardSkeleton` under the header in a ScrollView — `screens/BrowseJobsScreen.tsx:385-394`
- BrowseJobsScreen, empty — FlatList `ListEmptyComponent`: "No open jobs right now" — `screens/BrowseJobsScreen.tsx:413-423`
- BrowseJobsScreen, error — inline `<Text style={styles.error}>{error}</Text>` in list header (no retry control) — `screens/BrowseJobsScreen.tsx:358`
- BrowseJobsScreen, permission-denied — nearby pill label switches to "Enable location" when `nearbyState === 'unavailable'` (set L143-145, L150-153); label only, no dedicated surface — `screens/BrowseJobsScreen.tsx:209-210`
- CellJobsScreen, loading — inline `<ActivityIndicator size="large">` — `screens/CellJobsScreen.tsx:104-107`
- CellJobsScreen, empty — FlatList `ListEmptyComponent`: "No jobs here anymore … Pull to refresh." — `screens/CellJobsScreen.tsx:126-136`
- CellJobsScreen, error — inline `<Text style={styles.error}>{error}</Text>` banner (no retry control) — `screens/CellJobsScreen.tsx:102`
- ChatScreen, loading — inline `<ActivityIndicator size="large">` while `loading || threadsLoading` — `screens/ChatScreen.tsx:968-971`
- ChatScreen, empty — FlatList `ListEmptyComponent`: "Say hello" — `screens/ChatScreen.tsx:1092-1103`
- ChatScreen, error — inline `<Text style={styles.error}>{userMessage(error)}</Text>` banner — `screens/ChatScreen.tsx:954`
- ChatScreen, permission-denied — `alertAsync('Camera access needed', …)` on denied camera permission; dialog only, no screen surface — `screens/ChatScreen.tsx:881-884`
- ClientJobDetailScreen, loading — `<ActivityIndicator>` + `<Text>"Loading bids…"</Text>` — `screens/ClientJobDetailScreen.tsx:554-558`
- ClientJobDetailScreen, empty — "No bids yet" / "No active bids" block `screens/ClientJobDetailScreen.tsx:576-589`; missing-job full-screen state "This job is no longer available" `screens/ClientJobDetailScreen.tsx:337-362`
- ClientJobDetailScreen, error — "Bids may be out of date" banner + Retry `screens/ClientJobDetailScreen.tsx:532-551`; "Couldn't load bids" state + "Try again" `:559-575`; "Couldn't load the worker profile" banner + Retry `:697-714`
- CounterofferScreen, error — `alertAsync` dialogs inside the embedded OfferComposer ("Could not send bid" / "No counter-offers left" / counter failure) — `components/OfferComposer.tsx:157, 169, 172`; the screen itself renders no state
- CreateAccountScreen, loading — `AuthButton loading={loading}` submit spinner — `screens/CreateAccountScreen.tsx:161`
- CreateAccountScreen, error — `AuthField error` L118 / `PhoneNumberInput error` L138 field errors; `<AuthNotice tone="info">` provider notice L144 — `screens/CreateAccountScreen.tsx`
- EarningsScreen, empty — inline `<Text style={styles.emptyText}>"Nothing yet — finish a job…"</Text>` in the Ledger section — `screens/EarningsScreen.tsx:119-123`
- EmailCreateAccountScreen, loading — `AuthButton loading={loading}` submit spinner — `screens/EmailCreateAccountScreen.tsx:198`
- EmailCreateAccountScreen, error — `formError` box L183-187; field errors L118, L138, L152, L173 — `screens/EmailCreateAccountScreen.tsx`
- EmailSignInScreen, loading — `AuthButton loading={loading}` submit spinner — `screens/EmailSignInScreen.tsx:133`
- EmailSignInScreen, error — `formError` box L125-129; field errors L95, L115 — `screens/EmailSignInScreen.tsx`
- EmailSignInScreen, permission-denied — banned-account `<AuthNotice tone="danger">` "This account has been suspended…" — `screens/EmailSignInScreen.tsx:77-84`
- HomeScreen, loading — one skeleton card (`Skeleton` thumb + 2 lines) — `screens/HomeScreen.tsx:374-383`
- HomeScreen, empty — inline `<Text style={styles.empty}>"No open jobs right now…"</Text>` — `screens/HomeScreen.tsx:391-394`
- HomeScreen, error — notice `<Text>"Couldn't load open jobs."</Text>` + "Try again" Pressable — `screens/HomeScreen.tsx:384-390`
- JobDetailScreen, loading — inline `<ActivityIndicator>` while `checking` the viewer's own offer — `screens/JobDetailScreen.tsx:581-582`
- JobDetailScreen, empty — missing-job block "This job is no longer available" + "Go back" — `screens/JobDetailScreen.tsx:426-440`
- JobDetailScreen, error — `alertAsync` dialogs only (place bid L283, withdraw L353, accept L374, decline L401); offer/chain refresh failures `console.warn` only, nothing rendered — `screens/JobDetailScreen.tsx:200, 211`
- LaunchScreen, loading — the component is itself the branded app-boot loading overlay: full-screen splash held until `sessionReady && floorReached`, then crossfades out — `screens/LaunchScreen.tsx:131-155`
- LegalDocumentScreen, empty — missing-document fallback `<Text style={styles.muted}>"This document isn't available…"</Text>` — `screens/LegalDocumentScreen.tsx:24-36`
- LegalGateScreen, loading — `AuthButton loading={saving}` on "Agree and continue" — `screens/LegalGateScreen.tsx:350-359`
- LegalGateScreen, error — inline `<Text style={styles.error}>{error}</Text>` (set at L209-216, "…You need a connection to continue.") — `screens/LegalGateScreen.tsx:344-348`
- MapScreen, loading — permission-check spinner (`MapPinIcon` + `ActivityIndicator`) `components/HotspotMap.native.tsx:91-102`; "Updating hotspots…" pill `:179-191`; `loading` prop passed at `screens/MapScreen.tsx:101`
- MapScreen, empty — HotspotMap empty banner (`!loading && cells.length === 0`) — `components/HotspotMap.native.tsx:193-203`
- MapScreen, error — error banner + "Try again" Pressable — `screens/MapScreen.tsx:73-82`
- MapScreen, permission-denied — "Location is off" fallback with "Open Settings" and "View map without location" buttons — `components/HotspotMap.native.tsx:104-125`
- MessagesInboxScreen, loading — inline `<ActivityIndicator size="large">` — `screens/MessagesInboxScreen.tsx:321-324`
- MessagesInboxScreen, empty — FlatList `ListEmptyComponent`: "No messages yet" — `screens/MessagesInboxScreen.tsx:376-386`
- MessagesInboxScreen, error — inline `<Text style={styles.error}>{userMessage(error)}</Text>` banner — `screens/MessagesInboxScreen.tsx:319`
- MyJobsHubScreen, loading — inline `ActivityIndicator` + `<Text>"Loading your jobs…"</Text>` — `screens/MyJobsHubScreen.tsx:258-262`
- MyJobsHubScreen, empty — inline empty view `<Text>"Nothing here yet"</Text>` + per-tab `emptyText` + "Post another job" CTA — `screens/MyJobsHubScreen.tsx:297-316` (copy L225-235)
- MyJobsHubScreen, error — inline `errorCard` ("Couldn't refresh your jobs") with Retry `Pressable` — `screens/MyJobsHubScreen.tsx:276-295`
- NotificationSettingsScreen, loading — centered `ActivityIndicator` — `screens/NotificationSettingsScreen.tsx:177-180`
- NotificationSettingsScreen, error — inline `loadError` warn banner + "Try again" `Pressable` — `screens/NotificationSettingsScreen.tsx:183-193`
- NotificationSettingsScreen, permission-denied — `deliveryNotice()` 'denied' branch ("Notifications are turned off for Brazos on this device…") — `screens/NotificationSettingsScreen.tsx:161-167`, rendered as notice banner L194-208
- PostJobScreen, loading — `ActivityIndicator` in `loadingWrap` while edit-mode job loads — `screens/PostJobScreen.tsx:841-844`
- PostJobScreen, error — `alertAsync` dialogs only: edit-load failure + `goBackOrHome` L396-414; submit failure "Could not post job" L709-719; offer failure L614-622; no in-screen error state
- ProfileReviewsScreen, loading — centered `ActivityIndicator` — `screens/ProfileReviewsScreen.tsx:116-119` (page-2 footer spinner L187-191)
- ProfileReviewsScreen, empty — `ListEmptyComponent` `<Text>"No reviews yet"</Text>` — `screens/ProfileReviewsScreen.tsx:175-186`
- ProfileReviewsScreen, error — centered `errorText` + "Try again" `Button` — `screens/ProfileReviewsScreen.tsx:120-129`
- ProfileScreen, loading — centered `ActivityIndicator` — `screens/ProfileScreen.tsx:406-409`
- ProfileScreen, error — `alertAsync('Could not save', …)` dialog on save only — `screens/ProfileScreen.tsx:288-289`; `useProfile`'s load `error` is never destructured (L58) — load failures render nothing
- ServicesPricingScreen, empty — inline `<Text>` "List what you do and what it costs…" when `services.length === 0` — `screens/ServicesPricingScreen.tsx:202-206`
- SetupScreen, loading — `ActivityIndicator` control while permission state is 'unknown' — `screens/SetupScreen.tsx:364-366`; `AuthButton loading={saving}` L272-277
- SetupScreen, error — inline `<Text style={styles.error}>` in fixed `messageSlot` — `screens/SetupScreen.tsx:262-266` (message set L167)
- SetupScreen, permission-denied — blocked-permission rows swap subtitle to `settingsHint` ("Enable this in device Settings" L195 / "Turn this on in device Settings" L203) — `screens/SetupScreen.tsx:340-345`
- SignInScreen, loading — `AuthButton loading` spinner — `screens/SignInScreen.tsx:132-136`
- SignInScreen, error — `PhoneNumberInput error` field message L113-123 + `AuthNotice tone="info"` for provider notices L128
- SignInScreen, permission-denied — `bannedNotice` `AuthNotice tone="danger"` (account suspended) — `screens/SignInScreen.tsx:103-110`
- SubmitBidScreen, loading — `Button loading={submitting}` inside shared `OfferComposer` — `components/OfferComposer.tsx:266`
- SubmitBidScreen, error — `alertAsync('Could not send bid', …)` / counter-limit dialogs inside `OfferComposer` — `components/OfferComposer.tsx:157, 172`; no in-screen error state
- SubmitBidScreen, permission-denied — customer-mode guard view `<Text>"Bidding lives in Worker Mode"</Text>` + "Switch to Worker Mode" `Button` — `screens/SubmitBidScreen.tsx:34-54`
- VerifyPhoneScreen, loading — `AuthButton loading={submitting}` L358-364; resend label `'Sending…'` L383
- VerifyPhoneScreen, error — inline error `<Text>` in reserved `messageSlot` L348-356; `StaleChallenge` full-body view L306-311 (component L442-467)
- WorkChecklistScreen, empty (item list) — inline `emptyCard` `<Text>"Plan the job in steps"</Text>` — `screens/WorkChecklistScreen.tsx:183-191` (job-missing empty uses ScreenStates L70-77)
- WorkerHomeScreen, loading — two `WorkerJobCardSkeleton` — `screens/WorkerHomeScreen.tsx:334-338`
- WorkerHomeScreen, empty — inline `<Text>"No open jobs right now — …"</Text>` — `screens/WorkerHomeScreen.tsx:346-349`
- WorkerHomeScreen, error — inline notice `<Text>"Couldn't load open jobs."</Text>` + "Try again" `Pressable` — `screens/WorkerHomeScreen.tsx:339-345`
- WorkerHomeScreen, permission-denied — nearby pill label `'Enable location'` when location permission not granted — `screens/WorkerHomeScreen.tsx:182-184` (state set L120-122)
- WorkerJobScreen, loading — centered `ActivityIndicator` — `screens/WorkerJobScreen.tsx:319-322`
- WorkerJobScreen, empty — `<Text>"Job not found."</Text>` — `screens/WorkerJobScreen.tsx:323-324`
- WorkerJobScreen, error — inline error `<Text style={styles.error}>` banner above content — `screens/WorkerJobScreen.tsx:317`
- WorkerJobScreen, permission-denied — `noticeCard` `<Text>"You're not the assigned worker for this job."</Text>` — `screens/WorkerJobScreen.tsx:416-422`
- WorkerProfileScreen, loading — centered `ActivityIndicator` — `screens/WorkerProfileScreen.tsx:171-174`
- WorkerProfileScreen, error — centered `errorText` + "Try again" `Button` — `screens/WorkerProfileScreen.tsx:175-179`
- WorkerResultsScreen, loading — four `WorkerJobCardSkeleton` — `screens/WorkerResultsScreen.tsx:209-214`
- WorkerResultsScreen, empty — `ListEmptyComponent`: filtered variant "No jobs match your filters" + "Clear filters" L244-259; general variant via `emptyTitle()`/`emptyBody()` L260-278 (helpers L294-326)
- WorkerResultsScreen, error — `jobsError` rendered as empty-state title "Couldn't load jobs" (emptyTitle L299, rendered L273); retry = pull-to-refresh `RefreshControl` L231-241
- WorkerResultsScreen, permission-denied — `geoState 'denied'` → title "Location is off" L300 + `geoMessage` body L313, rendered L261-277
- WorkerSearchScreen, loading — `SearchStateCard busy` ("Finding strong matches") — `screens/WorkerSearchScreen.tsx:281-289`
- WorkerSearchScreen, empty — idle `SearchStateCard` "Describe what you need" L308-316; zero-results card "No workers matched" + "Post a job" `Button` L317-332
- WorkerSearchScreen, error — `SearchStateCard tone="danger"` "We couldn't load matches" + "Try again" `Button` — `screens/WorkerSearchScreen.tsx:290-307`

---

## 3. Verification badge surface

### (a) Emittable strings — `components/VerificationBadge.tsx`

The component (55 lines) emits exactly two user-visible strings. It sets no
`accessibilityLabel`, no `accessibilityRole`, and no tooltip; the two
`Ionicons` glyphs (`"shield-checkmark"` L15, `"ellipse-outline"` L23) carry no
text or accessibility props. Prop signature (L11):
`export function VerificationBadge({ status }: { status?: string | null })`.
Its doc comment (L6-10): "Only claims verification when the persisted status
is exactly `verified`. The repository has no identity-check provider or
workflow…".

| String | Condition / prop driving it | file:line |
|---|---|---|
| `Verified` | `isVerified(status)` is true — i.e. the `status` prop `=== 'verified'` exactly (`lib/profiles.ts:203-205`: `return status === 'verified';`) | `components/VerificationBadge.tsx:16` |
| `Not verified` | Every other `status` value: `null`, `undefined`, `'unverified'`, or any other string (unconditional else branch, L21) | `components/VerificationBadge.tsx:24` |

### (b) Render sites

Six components/screens render it (7 JSX sites); zero in `ui/`, `navigation/`,
`hooks/`, `modes/`, and zero in any `*.web.tsx` or the frozen web surface.

| file:line | Screen / component | Exact props passed |
|---|---|---|
| `screens/BidDetailScreen.tsx:187-189` | BidDetailScreen, worker identity row | `status={offer.worker.verification_status}` — guarded by `{offer.worker ? ( … ) : null}` (L186) |
| `screens/ClientJobDetailScreen.tsx:748` | ClientJobDetailScreen, "ASSIGNED WORKER" card | `status={assignedWorker.verification_status}` — guarded by `{assignedWorker ? ( … ) : null}` (L747) |
| `screens/CompareBidsScreen.tsx:169` | `CompareRow` inside CompareBidsScreen, row footer | `status={worker.verification_status}` — `{worker ? <VerificationBadge …/> : <View />}`; `const worker = bid.worker` (L114) |
| `components/OfferCard.tsx:207` | OfferCard, **`list` variant only** (trust row); the `thread` variant rendered by `screens/ChatScreen.tsx:1014` contains no badge | `status={worker.verification_status}` — `{worker ? <VerificationBadge …/> : null}`; `const worker = offer.worker` (L135). Sole `list`-variant caller: `screens/ClientJobDetailScreen.tsx:627` (`variant="list" offer={bid}`) |
| `screens/ServicesPricingScreen.tsx:193` | ServicesPricingScreen, "Verification" card | `status={profile?.verification_status}` |
| `screens/WorkerProfileScreen.tsx:200` | WorkerProfileScreen, profile header name row | `status={profile?.verification_status}` |
| `screens/WorkerSearchScreen.tsx:458` | `WorkerResultCard` inside WorkerSearchScreen, result name row | `status={profile.verification_status}` — `const { profile, matchedCategories } = match` (L436) |

### (c) Data chains

`PUBLIC_PROFILE_COLUMNS` (`lib/profiles.ts:46-47`) includes
`verification_status` and is the projection used by every direct profile read.

| Render site | Hook / lib hops (file:line) | Ultimate source |
|---|---|---|
| BidDetailScreen:187 | `useJobOffers(job.id)` (`screens/BidDetailScreen.tsx:42` → `hooks/useJobOffers.ts:16-30`) → `fetchOffersForJob()` (`lib/offers.ts:327-334`): `supabase.from('job_offers').select(OFFER_COLUMNS + worker:profiles!job_offers_worker_id_fkey(PUBLIC_PROFILE_COLUMNS))` | `profiles.verification_status` (embedded via FK from `job_offers`) |
| CompareBidsScreen:169 | Same chain: `useJobOffers(job.id)` (`screens/CompareBidsScreen.tsx:42`) → `fetchOffersForJob()` (`lib/offers.ts:327-334`) | `profiles.verification_status` |
| ClientJobDetailScreen:748 | `loadAssignedWorker()` (`screens/ClientJobDetailScreen.tsx:166-187`) → `fetchProfileById(workerId)` (L177 → `lib/profiles.ts:180-191`): `supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS).eq('id', id)` | `profiles.verification_status` |
| OfferCard:207 (via ClientJobDetailScreen:627) | `offer` prop = `bid` from `useJobOffers` (`screens/ClientJobDetailScreen.tsx:90`) → `fetchOffersForJob()` (`lib/offers.ts:327-334`) | `profiles.verification_status` |
| ServicesPricingScreen:193 | `load()` (`screens/ServicesPricingScreen.tsx:52-62`) → `fetchMyProfile(user.id)` (`lib/profiles.ts:115-128`): `supabase.rpc('get_my_profile')` (defined `supabase/phase29_security_hardening.sql:107-117`: `select p.* from public.profiles p where p.id = auth.uid()`), with a `PGRST202`-only fallback to `supabase.from('profiles').select(SELF_PROFILE_COLUMNS)`. Also refreshed by `saveAvailability()` → `updateProfile()` → `supabase.rpc('update_my_profile')` (`lib/profiles.ts:63-80`; `setProfile` at screen L150) | RPC `get_my_profile` / `update_my_profile` → `profiles.verification_status` |
| WorkerProfileScreen:200 | `load()` (`screens/WorkerProfileScreen.tsx:95-107`) → `fetchProfileById(params.workerId)` (L98 → `lib/profiles.ts:180-191`) | `profiles.verification_status` |
| WorkerSearchScreen:458 | `findWorkers()` (`screens/WorkerSearchScreen.tsx:113` → `lib/workerSearch.ts:672-705`), two paths: **(1) semantic** — `rankWorkersOnServer()` (`lib/workerSearch.ts:686`, `:629`) → `supabase.functions.invoke('worker-search')` (`:635`) → Edge Function `supabase/functions/worker-search/index.ts` → `rpc('match_workers_semantic', …)` (`:555-556`) → RPC selects `p.verification_status::text` from `public.profiles` (`supabase/phase40_fix_semantic_match_return_type.sql:152`; latest re-creation `supabase/phase68_deleted_at_authorization.sql:373`) → mapped `verificationStatus: row.verification_status` (`index.ts:435`) → `toWorkerMatch()` sets `verification_status: row.verificationStatus ?? null` (`lib/workerSearch.ts:599`); **(2) fallback** — `searchWorkers()` (`lib/workerSearch.ts:703`, `:449`) → `supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS)` (`:461-465` by category overlap, `:470-474` by name/bio ilike) | `profiles.verification_status` (via RPC `match_workers_semantic` or direct select) |

### (d) What makes a profile read as verified today

Mechanically, the badge reads "Verified" if and only if
`profiles.verification_status = 'verified'` — an exact string comparison in
`lib/profiles.ts:203-205` (`isVerified`). Every other value of that one
column — `null`, `'unverified'`, any other enum label, or a missing profile
row (all call sites null-guard and skip the badge) — renders "Not verified".
No other column, table, or RPC participates in the decision.

The column `public.profiles.verification_status` is a named Postgres enum in
the live database whose type and labels are defined by no migration in this
repository: `supabase/phase67_account_deletion.sql:527-529` states
"profiles.verification_status is a named ENUM in the live database … this
repo has no migration that defines its labels", and
`supabase/phase75_security_hardening.sql:463` repeats "a named enum this repo
never defines"; `phase40_fix_semantic_match_return_type.sql` exists solely
because the column is an enum, not `text`. The only writes to it discoverable
in `supabase/*.sql` are `update public.profiles set verification_status =
'unverified'` on account deletion — `phase67_account_deletion.sql:543` and
`phase75_security_hardening.sql:477` — each guarded by a check that the
`'unverified'` label exists in the enum. No SQL in the repo ever writes
`'verified'`. The app cannot write the column at all:
`phase29_security_hardening.sql:84-89` revokes direct UPDATE on `profiles`,
and the `update_my_profile()` allow-list (`phase29:161`, current version
`phase53_worker_self_service.sql:171-172`) rejects `verification_status` as
"a protected or unknown field"; the client-side `ProfileUpdate` type
(`lib/profiles.ts:35-44`) does not carry it. Read access for any
authenticated user is granted column-by-column at
`phase29_security_hardening.sql:96`. Therefore any `'verified'` value a
profile holds today was written outside this repository's code and
migrations; the repository contains no identity-verification provider or
workflow (`components/VerificationBadge.tsx:6-10`;
`screens/ServicesPricingScreen.tsx:196-197`: "Identity verification isn't
connected in this build — no provider, no checks. The badge shows exactly
what the database records.").

---

## 4. Trust and money copy

Word list scanned (case-insensitive, word-bounded): escrow, always, forever,
guarantee, guaranteed, free, no fee, no fees, 0%, fee, fees, commission,
verified, unverified, not verified, background check, secure, protected.
Totals: **27 user-visible strings** in app scope; **1 code-context literal**;
**10 legal-copy strings** in `lib/legal/`; 7 additional matches verified as
comments or style identifiers, listed for completeness. "escrow", "0%",
"guarantee(d)" and "background check" have **zero** user-visible occurrences
in app scope. Strings marked *(fragment)* are one line of a sentence that
continues on the next source line; the quoted text is the exact line content.

### 4a. User-visible strings (app scope)

| File | Line | Keyword(s) | Exact string |
|---|---|---|---|
| components/JobFilterSheet.tsx | 119 | always | `Jobs with no stated budget always stay visible — that's an open` *(fragment; continues L120 "negotiation, not a low one.")* |
| components/VerificationBadge.tsx | 16 | verified | `Verified` |
| components/VerificationBadge.tsx | 24 | not verified | `Not verified` |
| screens/ApproveOrDisputeScreen.tsx | 281 | protected | `PAYMENT NOT PROTECTED YET` |
| screens/ApproveOrDisputeScreen.tsx | 285 | protected | `This job finished without a protected payment, so there is nothing to release yet — the worker can't be paid until the payment is protected and then released.` |
| screens/ApproveOrDisputeScreen.tsx | 296 | protected | `This job finished without a protected payment, so there is` *(fragment)* |
| screens/CheckoutScreen.tsx | 100 | protected | `The person who posted this job funds its protected payment.` |
| screens/CheckoutScreen.tsx | 147 | protected | `Authorized, but not yet protected` |
| screens/CheckoutScreen.tsx | 165 | protected | `Protected checkout` |
| screens/CheckoutScreen.tsx | 215 | fee | `Platform fee` |
| screens/CheckoutScreen.tsx | 245 | protected | `does the job. They can see the funds are protected, and can't be paid early.` *(template fragment)* |
| screens/CheckoutScreen.tsx | 292 | protected | `This authorizes the sandbox amount and places it in protected/held state. No real money is being charged — this is sandbox. Funds stay held until you approve the finished work — releasing them is a separate, deliberate step after the job is done.` |
| screens/ClientJobDetailScreen.tsx | 794 | protected | `PAYMENT NOT PROTECTED YET` |
| screens/ClientJobDetailScreen.tsx | 803 | protected | `The work is finished, but the worker can't be paid until the payment is protected and then released.` |
| screens/ClientJobDetailScreen.tsx | 814 | protected | `PROTECTED PAYMENT · SANDBOX` |
| screens/EarningsScreen.tsx | 108 | fees | `Platform fees on these rows: {formatBudget(s.feeCents)} — the` *(JSX fragment with expression)* |
| screens/JobConfirmedScreen.tsx | 80 | protected | `The payment is authorized but not yet protected. Finish checkout to confirm the job.` |
| screens/JobConfirmedScreen.tsx | 99 | protected | `${workerName} is hired and your payment is protected. Funds stay held until the work is done and approved — nothing has been released.` |
| screens/JobDetailScreen.tsx | 79 | unverified | `Unverified` (`const VERIFICATION_LABEL = 'Unverified';` — rendered in the header pill at L528-531) |
| screens/JobDetailScreen.tsx | 730 | fee | `Est. payout after fee` |
| screens/JobDetailScreen.tsx | 737 | fee | `)}% platform fee.` *(template fragment of the payout sentence beginning L735)* |
| screens/JobDetailScreen.tsx | 738 | fee | `Estimate only, from the customer's stated budget. BRAZOS takes no platform fee — you receive the full agreed amount.` |
| screens/PostJobScreen.tsx | 1048 | protected | `its precise coordinates stay in protected job-location data.` *(fragment)* |
| screens/ReviewAndTipScreen.tsx | 246 | protected | `This job finished without a protected payment, so there is no` *(fragment)* |
| screens/WelcomeScreen.tsx | 158 | verified | `Verified workers` |
| screens/WelcomeScreen.tsx | 170 | protected | `Protected payment` |
| screens/WorkerJobScreen.tsx | 379 | protected | `PAYMENT PROTECTED · SANDBOX` |

### 4b. Code-context literals (word-list matches that are not user-visible copy)

| File | Line | Keyword(s) | String | Line context |
|---|---|---|---|---|
| screens/VerifyPhoneScreen.tsx | 207 | verified | `verified-mock` | `if (result.status === 'verified-mock') {` |

Matches verified as comments or style identifiers (not rendered):

| File | Line | Keyword(s) | Why excluded |
|---|---|---|---|
| components/VerificationBadge.tsx | 14 | verified | `styles.verified` — style reference, not text |
| components/VerificationBadge.tsx | 38 | verified | `verified: {` — StyleSheet key |
| screens/BrowseJobsScreen.tsx | 365 | always | JSX comment continuation |
| screens/JobDetailScreen.tsx | 655 | free | `{/* No Message CTA here. Free-form …` — JSX comment |
| screens/JobDetailScreen.tsx | 724 | fee | `{/* Payout — … the fee sentence …` — JSX comment |
| screens/ProfileScreen.tsx | 707 | forever | "delete forever" inside a JSX comment |
| screens/SetupScreen.tsx | 284 | always | JSX comment continuation |

### 4c. Legal copy (`lib/legal/` — legal documents, listed separately)

| File | Line | Keyword(s) | Exact string |
|---|---|---|---|
| lib/legal/privacyPolicy.ts | 187 | secure | `are hashed by our authentication provider. No system is perfectly secure, and` |
| lib/legal/privacyPolicy.ts | 188 | guarantee | `we cannot guarantee against every possible breach.` |
| lib/legal/termsOfService.ts | 42 | secure | `account, and for keeping your password secure.` |
| lib/legal/termsOfService.ts | 85 | guarantee | `## 5. No screening, no guarantee` |
| lib/legal/termsOfService.ts | 87 | background checks | `BRAZOS DOES NOT PERFORM BACKGROUND CHECKS, CRIMINAL RECORD CHECKS, IDENTITY` |
| lib/legal/termsOfService.ts | 93 | guarantee | `by users. Brazos does not independently verify them and does not guarantee` |
| lib/legal/termsOfService.ts | 96 | guarantee | `Brazos does not guarantee:` |
| lib/legal/termsOfService.ts | 131 | fees | `for all claims is limited to the greater of (a) the total fees you paid to` |
| lib/legal/termsOfService.ts | 144 | commission | `- carry your own insurance appropriate to the work you do or commission;` |
| lib/legal/termsOfService.ts | 192 | free | `By posting content, you grant Brazos a non-exclusive, worldwide, royalty-free` |

---

## 5. Map surface

| File | Role | Reads | Source (RPC / table / hook / device API) with file:line |
|---|---|---|---|
| `screens/MapScreen.tsx` | Screen (Map tab root, registered as `MapMain` at `navigation/sharedStacks.tsx:120`); defined `screens/MapScreen.tsx:23` | Hotspot cells + loading/error; current UI mode; selected cell (local state) | `useHotspots()` (`screens/MapScreen.tsx:25`); `useMode()` from ModeContext (`screens/MapScreen.tsx:26`, hook defined `modes/ModeProvider.tsx:107` — in-memory context, no AsyncStorage). Navigates to `'CellJobs'` with `{ ilat, ilng, count: job_count }` (`screens/MapScreen.tsx:137-141`) and cross-tab to `'WorkerResults'` via `navigateAcrossTabs` (`screens/MapScreen.tsx:63`, defined `lib/navigationRef.ts:115`). No direct Supabase reads. |
| `hooks/useHotspots.ts` | Data hook for hotspot cells; defined `hooks/useHotspots.ts:17` | Aggregated cells; realtime change signal on jobs | `fetchHotspots()` (`hooks/useHotspots.ts:31`); Supabase realtime channel `` `hotspots:jobs:${instanceId}:${run}` `` on `postgres_changes` `{ event: '*', schema: 'public', table: 'jobs' }` (`hooks/useHotspots.ts:51-58`) — signal only, coordinates never read from the payload; errors formatted via `userMessage` (`lib/errorMessage.ts:54`) |
| `lib/hotspots.ts` | Helper module: cell types, tiers, geometry, and all map RPC wrappers | — | `fetchHotspots()` → `supabase.rpc('job_hotspots')` (`lib/hotspots.ts:143`); `fetchJobsInCell()` → `supabase.rpc('jobs_in_cell', { p_ilat, p_ilng })` (`lib/hotspots.ts:165`) then re-hydrates via `fetchOpenJobsByIds` (`lib/hotspots.ts:172`); `fetchJobsWithinRadius()` → `supabase.rpc('jobs_within_radius', { p_lat, p_lng, p_radius_miles })` (`lib/hotspots.ts:211`) — exported here but called by Worker Home surfaces, not the map screens; pure geometry: `tierForCount` (:37), `cellPolygon` (:71), `glowRingsForCell` (:117), `milesBetween` (:182), `cellsWithinMiles` (:235), `fetchOpenJobsInCells` (:251), `summarizeCategories` (:269). Cell constants `CELL_MILES = 0.27`, `REF_LAT = 40.7128` (:57-58) mirror the SQL |
| `components/HotspotMap.native.tsx` | Native map component (glow rings + tap targets); defined `components/HotspotMap.native.tsx:27` | Cells/loading via props; device location permission and one GPS fix | Device APIs: `Location.requestForegroundPermissionsAsync()` (`:36`), `Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })` (`:50`) from `expo-location`; `Linking.openSettings()` (`:116`); `react-native-maps` `MapView`/`Circle`/`Polygon` (`:4`, rendered `:129-177`). Fallback center `DEFAULT_REGION` 40.6501/−73.9496 (`:20-25`); `fitToCoordinates` over cell centers when no GPS (`:85-88`). No Supabase reads |
| `components/HotspotMap.d.ts` | Type surface for the platform-resolved `./HotspotMap` import; declares `HotspotMap` (`components/HotspotMap.d.ts:6`) | — | Types only, from `HotspotMapProps` (`lib/hotspots.ts:131`) |
| `components/HotspotMap.web.tsx` | Web implementation — **frozen web/PWA surface, excluded from this audit**; existence noted only | — | — |
| `components/MapPinIcon.tsx` | Pin icon (loading/denied/empty placeholder glyph); defined `components/MapPinIcon.tsx:19` | Theme palette | `useThemeColors()` (`components/MapPinIcon.tsx:20`, defined `hooks/useThemeColors.ts:11`). No data reads |
| `screens/CellJobsScreen.tsx` | Screen (hotspot drill-down list, registered as `CellJobs` at `navigation/sharedStacks.tsx:121`); defined `screens/CellJobsScreen.tsx:26` | Route params `{ ilat, ilng, count }`; jobs in the cell; per-job offer counts; realtime change signal | Params via `useRoute<RouteProp<MapStackParamList, 'CellJobs'>>` (`:28`; param type `lib/navigation.ts:331`); `fetchJobsInCell(params.ilat, params.ilng)` (`:43`); `useOfferCounts(jobs.map(j => j.id))` (`:32`); realtime channel `` `cell-jobs:${instanceId}:${run}` `` on `postgres_changes` `{ event: '*', schema: 'public', table: 'jobs' }` (`:65-72`) |
| `hooks/useOfferCounts.ts` | Data hook, batched offer counts per job id; defined `hooks/useOfferCounts.ts:16` | Offer counts keyed by job id | `fetchOfferCounts()` (`hooks/useOfferCounts.ts:30`, defined `lib/offers.ts:485`) → `supabase.rpc('job_offer_counts', { p_job_ids })` batched (`lib/offers.ts:492`) |
| `lib/jobs.ts` | Helper: job row shape, category labels, hydration query | — | `JOB_CATEGORY_LABELS` (`lib/jobs.ts:29`); `toOpenJob()` (`:258`); `fetchOpenJobsByIds()` (`:334`) → `supabase.from('jobs').select(OPEN_JOB_COLUMNS).in('id', ids)` (`:337-340`), where `OPEN_JOB_COLUMNS` (`:290-291`) is the explicit allowlist `id, client_id, title, description, category, location, budget_cents, budget_min_cents, budget_max_cents, scheduled_date, arrival_start_hour, arrival_end_hour, status, created_at, photos, videos` |
| `components/BrowseJobCard.tsx` | Job card rendered per row in CellJobsScreen list | Job + bidCount via props; current user | `useAuth()` (`components/BrowseJobCard.tsx:48`); no Supabase reads of its own |
| `lib/supabase.ts` | Supabase client (untyped) | Env config; persisted session | `createClient(SUPABASE_URL, SUPABASE_KEY, …)` (`lib/supabase.ts:13`), env from `@env` (`:4`); auth session persisted in AsyncStorage (`:16`) — the only AsyncStorage use in this surface |
| `lib/navigation.ts` | Route param types | — | `MapStackParamList` (`lib/navigation.ts:329`): `CellJobs: { ilat: number; ilng: number; count: number }` (`:331`); `MapStackNavigation` (`:358`); Map stack mounted in both trees (`:444`, `:450`) |
| `lib/navigationRef.ts`, `lib/errorMessage.ts`, `lib/theme.ts`, `modes/ModeProvider.tsx`, `hooks/useThemeColors.ts`, `components/Button.tsx`, `components/Card.tsx`, `components/ScreenHeader.tsx` | Support: nav helpers (`navigateAcrossTabs` `lib/navigationRef.ts:115`, `goBackOrHome` `:188`), error formatting (`userMessage` `lib/errorMessage.ts:54`), tokens, mode context (`useMode` `modes/ModeProvider.tsx:107`), theme hook, UI primitives | — | No RPC/table/device reads in the map path |

### Cell/hotspot computation path

Cells and hotspots are computed **server-side**, in the SECURITY DEFINER RPC
`public.job_hotspots()` — no client-side aggregation. The current definition
(`supabase/phase43_job_offers_foundation.sql:367-409`) buckets `public.jobs`
joined to `public.job_locations` (`:392-393`) where `status = 'open' and
visibility = 'open_market'` into a fixed grid of `floor(loc.lat / dlat)` /
`floor(loc.lng / dlng)` with `dlat = 0.27/69.0` and
`dlng = 0.27/(69.0*cos(radians(40.7128)))` (`:383-384`), returning `ilat,
ilng, cell_lat, cell_lng, job_count, categories` (jsonb of per-category
counts) and never any individual job coordinate. The client
(`lib/hotspots.ts:143`) only maps each returned cell to a color tier
(`tierForCount`, `lib/hotspots.ts:37`), concentric glow-ring geometry
(`glowRingsForCell`, `:117`), and an invisible tap-target polygon
(`cellPolygon`, `:71`) whose constants (`CELL_MILES = 0.27`,
`REF_LAT = 40.7128`, `lib/hotspots.ts:57-58`) mirror the SQL. Defining
migrations for the three map RPCs: `job_hotspots` and `jobs_in_cell` created
in `supabase/phase11_map_hotspots.sql` (`:34`, `:81`), redefined in
`supabase/phase12_job_location_privacy.sql` (`:125`, `:171`), current bodies
in `supabase/phase43_job_offers_foundation.sql` (`:367`, `:414`) with
`search_path` hardening in
`supabase/phase64_security_definer_search_path.sql` (`:71`, `:73-74`);
`jobs_within_radius` created in `supabase/phase41_jobs_within_radius.sql`
(`:38`), redefined in phase43 (`:452`), current in
`supabase/phase75_security_hardening.sql` (`:205`, distance snapped and
radius capped); `supabase/phase24_flatlands_red_tier_boost.sql` and
`supabase/phase22_job_listings_seed.sql` reference `job_hotspots` for seed
data only. `job_offer_counts` (CellJobsScreen's bid counts) is defined in
`supabase/phase46_offer_rpcs_and_rls.sql:847` (`job_offer_count` at `:830`).

### CellJobsScreen param/fetch split

Via route params it receives only `{ ilat, ilng, count }`
(`lib/navigation.ts:331`), passed from MapScreen's selected-cell sheet
(`screens/MapScreen.tsx:137-141`); `count` is used solely as a pre-load
placeholder subtitle — once the first fetch resolves, `jobs.length` replaces
it (`screens/CellJobsScreen.tsx:92`). It fetches everything else itself: the
job list via `fetchJobsInCell(params.ilat, params.ilng)`
(`screens/CellJobsScreen.tsx:43`), which calls
`supabase.rpc('jobs_in_cell', { p_ilat, p_ilng })` (`lib/hotspots.ts:165`;
the RPC selects `id, client_id, title, description, category, location,
budget_cents, status, created_at` from `public.jobs` join
`public.job_locations`, without lat/lng —
`supabase/phase43_job_offers_foundation.sql:414-447`) and then re-reads those
ids through `fetchOpenJobsByIds` → `supabase.from('jobs')` with the
`OPEN_JOB_COLUMNS` allowlist (`lib/hotspots.ts:172`, `lib/jobs.ts:337-340`)
to add `photos`/`videos`, falling back to the raw RPC rows if hydration fails
(`lib/hotspots.ts:176`); offer counts via `useOfferCounts` →
`supabase.rpc('job_offer_counts', { p_job_ids })` (`lib/offers.ts:492`); and
staleness via its own realtime subscription on table `'jobs'`
(`screens/CellJobsScreen.tsx:65-72`), debounced 1500 ms like `useHotspots`.

---

## 6. Duplicated presentation

Scope: `screens/`, `components/`, `ui/` (excluding `*.web.tsx` and the frozen
web surface). "Locked" marks files in CLAUDE.md's never-modify list.

### 6.1 Job cards

| Component/site | file:line | What it renders | Used by |
|---|---|---|---|
| `BrowseJobCard` | `components/BrowseJobCard.tsx:36` | Horizontal card: 92px photo thumb or category-tinted glyph, title (2 lines), "category · location" line, inline "Your job" pill, `formatBudget` amount, bid count, time-ago | `screens/CellJobsScreen.tsx:113` (map-cell drill-down), `screens/JobDetailScreen.tsx:804` (similar-jobs strip) |
| `WorkerJobCard` (+ `WorkerJobCardSkeleton`) | `components/WorkerJobCard.tsx:41` (skeleton `:159`) | Horizontal card: 84px thumb/glyph, title, category `Chip`, "Your job" `Chip`, location row, bid-status row ("N bids so far"), optional "Posted X ago" (`variant="full"`), "Break the ice" row, "EST. PAY" eyebrow + `formatBudget` | `screens/BrowseJobsScreen.tsx:401` (locked), `screens/WorkerHomeScreen.tsx:353`, `screens/WorkerResultsScreen.tsx:220` (`variant="full"`) |
| `JobCard` | `ui/primitives/JobCard.tsx:74` | Mode-aware card: 92px thumb/glyph, title, "category · location · distance", "Your job" + "Break the ice" pills, "EST. PAY"/"EST. PRICE" eyebrow + `formatBudget`, bid count, time-ago, worker-only "Place a bid" button | `dev-tools/ComponentCatalog.tsx` only; its own header comment (`ui/primitives/JobCard.tsx:37-41`) states no screen has been migrated onto it and names `BrowseJobCard`, `WorkerJobCard`, and Home's `OpenJobCard` as the components it replaces |
| `HubCard` | `components/HubCard.tsx:47` | Vertical card: `StatusBadge` + time row, 60px thumb/category glyph, title, meta + counterparty lines, `formatBudget` price with label, next-action line / "View details" | `screens/MyJobsHubScreen.tsx:353, 389, 439, 478` (working / posted / pending-bid / settled-bid sections) |
| `OpenJobCard` (screen-local) | `screens/HomeScreen.tsx:428` (locked) | Card: thumb/glyph, title, "EST. PRICE" eyebrow + `formatBudget`, location row, "Your job" + category `Chip`s, interest line ("N pros interested"), high-demand meta row | `screens/HomeScreen.tsx:398` only |
| `MarketJobPreview` | `components/MarketJobPreview.tsx:47` | Full-screen customer-safe job presentation via `DetailScreen`: category glyph, title, "EST. PRICE" + `budgetRangeLabel`/`formatBudget`, approximate location, media, poster `Avatar` | `screens/JobDetailScreen.tsx:419` |
| Offer-thread job block | `components/OfferCard.tsx:399-424` | Inside a chat offer card: job title, "category · location" line, description, media thumbs — the same title/category/location trio the job cards render | `screens/ChatScreen.tsx:1014`, `screens/ClientJobDetailScreen.tsx:627` |
| Draft card (inline) | `screens/MyJobsHubScreen.tsx:323-343` | Pressable row: icon chip, "NOT PUBLISHED YET" eyebrow, draft title, resume line | MyJobsHubScreen only |

Overlap: `BrowseJobCard`, `WorkerJobCard`, `ui/primitives/JobCard`, and
HomeScreen's `OpenJobCard` all render, for the same `OpenJob` type:
`jobThumbnailUrl()` image with `imageFailed` fallback to a
`categoryAccent()`-tinted `JOB_CATEGORY_ICONS` glyph, job title, category
label, location, `formatBudget(budget_cents)` with an "Open"/"Open budget"
fallback, and a bid-count/interest line. The thumbnail-or-glyph fallback
block additionally recurs in `HubCard` (`components/HubCard.tsx:76-89`),
`MarketJobPreview` (`components/MarketJobPreview.tsx:62-67`), and
`JobDetailScreen:515-521`. The zero-bid "Break the ice" nudge is implemented
twice (`components/WorkerJobCard.tsx:139-144`,
`ui/primitives/JobCard.tsx:149-154`). `WorkerJobCard`'s header comment
(`:27-31`) documents the split from `BrowseJobCard` as deliberate.

### 6.2 Status badges / pills

| Component/site | file:line | What it renders | Used by |
|---|---|---|---|
| `StatusBadge` | `components/StatusBadge.tsx:51` | Rounded pill; color pair from its own string-keyed map (job `open/assigned/in_progress/completed/cancelled`, offer `pending/accepted/rejected/declined/withdrawn/expired/superseded`, report `actioned/dismissed`); optional label override | `screens/AdminReportsScreen.tsx:148`, `screens/ClientJobDetailScreen.tsx:395`, `screens/JobDetailScreen.tsx:639,678`, `screens/WorkerJobScreen.tsx:359`, `components/HubCard.tsx:71`, `components/OfferCard.tsx:225`, `components/OfferResponseActions.tsx:86` |
| `StatusPill` | `ui/primitives/StatusPill.tsx:154` | Bordered pill; tone/label from typed unions (`kind: job \| offer \| payment`), incl. the §H.3 payment wording | `screens/BidDetailScreen.tsx:136`, `screens/JobConfirmedScreen.tsx:123`, `dev-tools/ComponentCatalog.tsx:240-256` |
| `Chip` | `components/Chip.tsx:55` | Pill label with 5 variants; non-interactive `soft`/`sm` form is used as a tag pill ("Your job", category) | tag use: `components/WorkerJobCard.tsx:103-109`, `screens/HomeScreen.tsx:505-506`, `screens/WorkerSearchScreen.tsx:487` |
| `VerificationBadge` | `components/VerificationBadge.tsx:11` | Pill: shield-checkmark + "Verified" or ellipse + "Not verified" | see section 3 (7 sites) |
| Inline "Your job" pill | `components/BrowseJobCard.tsx:91-96` (styles `:161-176`) | person icon + "Your job" in `radius.pill` container | BrowseJobCard |
| Inline "Your job" / "Break the ice" pills | `ui/primitives/JobCard.tsx:143-154` (styles `:247-274`) | same two pills, mint/gold-tinted | ui/primitives/JobCard |
| Inline "Best value" tag | `screens/CompareBidsScreen.tsx:131-136` (styles `:201-217`) | sparkles icon + "Best value" pill | `CompareRow` |
| Inline "Best value" tag | `components/OfferCard.tsx:147-152` | sparkles icon + "Best value" pill (second implementation of the same tag) | OfferCard |
| Inline "Worked for you before" tag | `components/OfferCard.tsx:208-213` | repeat icon + text pill | OfferCard |
| Inline "Unverified" pill | `screens/JobDetailScreen.tsx:528-531` (styles `:960-973`) | shield-outline icon + `VERIFICATION_LABEL` ("Unverified", `:79`) in a `radius.pill` container — same concept as `VerificationBadge`'s not-verified branch | JobDetailScreen job header |
| Inline "Job request · needs your reply" pill | `components/ConversationRow.tsx:77-81` | briefcase icon + text pill | ConversationRow |
| Count badge | `screens/MyJobsHubScreen.tsx:97-99` (styles `:632-645`) | numeric count in a mint pill | `SectionHeading` |

Overlap: `StatusBadge` and `StatusPill` both render a lifecycle status as a
colored rounded pill and each keeps its own status→color/label map; the offer
vocabulary (`pending/accepted/declined/withdrawn/expired/superseded`) appears
in both maps. `StatusPill`'s header comment
(`ui/primitives/StatusPill.tsx:18-21`) states it "does not replace
components/StatusBadge.tsx" and that they were to converge in a later phase.
The "Your job" marker is rendered by four distinct implementations
(BrowseJobCard inline pill, ui/JobCard inline pill, WorkerJobCard `Chip`,
HomeScreen `Chip`). The "Best value" tag is implemented twice
(CompareBidsScreen, OfferCard). The verification pill is implemented twice
(`VerificationBadge`; JobDetailScreen's inline `unverifiedBadge` with
different icon and wording — "Unverified" vs "Not verified").

### 6.3 Avatars

| Component/site | file:line | What it renders | Used by |
|---|---|---|---|
| `Avatar` | `components/Avatar.tsx:11` | Circle: photo `Image`, else primary-colored circle with `getInitials(name)` | `MarketJobPreview:146`, BidDetailScreen, `WorkerSearchScreen:451`, JobDetailScreen, JobConfirmedScreen, `CompareBidsScreen:139`, ProfileScreen, ProfileReviewsScreen, `SavedWorkersScreen:114`, `AvatarPressable` |
| `AvatarPressable` | `components/AvatarPressable.tsx:28` | Wraps `Avatar` in a `Pressable` (long-press to view full-screen); renders bare `Avatar` when no photo/handler — all pixels come from `Avatar` | `ChatBubble:48`, `ConversationRow:49`, `OfferCard:162`, `ClientJobDetailScreen:732`, `ProfileScreen:435`, `WorkerProfileScreen:187` |

No inline circular-image/initials renderer exists outside these two:
`getInitials` has exactly one render site (`components/Avatar.tsx:20`), and
no screen defines its own person-circle. Two components, one strictly
delegating to the other.

### 6.4 Money labels

`formatBudget()` (`lib/jobs.ts:603`) is the single cents formatter;
`budgetRangeLabel()` (`lib/jobs.ts:619`) composes it. `MoneyText`
(`ui/primitives/MoneyText.tsx:49`) wraps `formatBudget` with payment-state
captions. Classification of every render site in scope (57 `formatBudget(`
occurrences across 25 files; the comment-only mention at
`components/OfferResponseActions.tsx:47` excluded). Totals: **10 MoneyText
render sites** (8 screens + the dev catalog) vs. **~45 direct-format sites**.

| file:line | Render context | Classification |
|---|---|---|
| `screens/ApproveOrDisputeScreen.tsx:265` | payment amount + state | via MoneyText |
| `screens/CheckoutScreen.tsx:261` | payment amount + state | via MoneyText |
| `screens/ClientJobDetailScreen.tsx:815`, `:824` | payment amounts + state | via MoneyText |
| `screens/EarningsScreen.tsx:143` | ledger row amount | via MoneyText |
| `screens/JobConfirmedScreen.tsx:122` | payment amount + state | via MoneyText |
| `screens/ReviewAndTipScreen.tsx:208`, `:234` | payment + tip amounts | via MoneyText |
| `screens/TrackWorkerScreen.tsx:197` | payment amount + state | via MoneyText |
| `screens/WorkerJobScreen.tsx:382` | payment amount + state | via MoneyText |
| `screens/ApproveOrDisputeScreen.tsx:199` | button title "Approve & release $X" | direct |
| `screens/ApproveOrDisputeScreen.tsx:380` | confirm-dialog title | direct |
| `screens/BidSentScreen.tsx:29` | `<Text>` receipt amount | direct |
| `screens/BidDetailScreen.tsx:142` | `<Text>` offer amount | direct |
| `screens/BidDetailScreen.tsx:309`, `:322` | button title / dialog title | direct |
| `screens/BrowseJobsScreen.tsx:323` (locked) | `<Text>` "POTENTIAL EARNINGS" banner total | direct |
| `screens/ChatScreen.tsx:1231`, `:1249`, `:1255` | prompt subtitle / dialog strings | direct |
| `screens/CheckoutScreen.tsx:206`, `:220`, `:226` | `<Text>` summary rows (amount, fee via `platformFeeCents`, total) | direct |
| `screens/CheckoutScreen.tsx:279`, `:291` | button title / dialog title | direct |
| `screens/ClientJobDetailScreen.tsx:429-432` | `<Text>` price block (with `budgetRangeLabel`) | direct |
| `screens/ClientJobDetailScreen.tsx:752` | `<Text>` "$X agreed" | direct |
| `screens/ClientJobDetailScreen.tsx:1020` | dialog title | direct |
| `screens/CompareBidsScreen.tsx:127` | accessibility label | direct |
| `screens/CompareBidsScreen.tsx:159` | `<Text>` row amount | direct |
| `screens/EarningsScreen.tsx:108` | `<Text>` fee note | direct |
| `screens/EarningsScreen.tsx:156`, `:169` | button title / dialog title | direct |
| `screens/EarningsScreen.tsx:185` | `<Text>` in local `Bucket` stat tile (`:181`) | direct |
| `screens/HomeScreen.tsx:491` (locked) | `<Text>` in local `OpenJobCard` "EST. PRICE" | direct |
| `screens/JobDetailScreen.tsx:95-97` | payout-range string from `formatBudget(workerPayoutCents(...))`, rendered as EST. PAY text | direct |
| `screens/JobDetailScreen.tsx:323` | prefilled bid message string | direct |
| `screens/JobDetailScreen.tsx:599` | `amountLabel` prop → rendered at `components/OfferResponseActions.tsx:90` `<Text>` | direct (pre-formatted string prop) |
| `screens/JobDetailScreen.tsx:641`, `:680` | `<Text>` bid amounts | direct |
| `screens/JobDetailScreen.tsx:543` | `<Text>` budget row (`budgetRangeLabel`) | direct |
| `screens/JobDetailScreen.tsx:757`, `:765` | `<Text>` + button title | direct |
| `screens/JobDetailScreen.tsx:830`, `:853`, `:864` | dialog titles | direct |
| `screens/PostJobScreen.tsx:816`/`:819`, `:1372` | `<Text>` review/confirmation (with `budgetRangeLabel`) | direct |
| `screens/PostJobScreen.tsx:1434` | dialog title | direct |
| `screens/ReviewAndTipScreen.tsx:270` | `<Text>` tip preset chips | direct |
| `screens/ReviewAndTipScreen.tsx:306`, `:324` | button title / dialog title | direct |
| `screens/WorkerHomeScreen.tsx:280` | `<Text>` "POTENTIAL EARNINGS" total | direct |
| `screens/WorkerJobScreen.tsx:363` | `<Text>` agreed amount | direct |
| `components/BrowseJobCard.tsx:101` | `<Text>` card budget | direct |
| `components/WorkerJobCard.tsx:150` | `<Text>` "EST. PAY" value | direct |
| `components/HubCard.tsx:109` | `<Text>` card price | direct |
| `ui/primitives/JobCard.tsx:162` | `<Text>` money value | direct |
| `components/MarketJobPreview.tsx:75` | `<Text>` "EST. PRICE" (with `budgetRangeLabel`) | direct |
| `components/OfferCard.tsx:201`, `:415` | `<Text>` offer amounts | direct |
| `components/OfferCard.tsx:473` | `amountLabel` prop → `OfferResponseActions.tsx:90` | direct (pre-formatted string prop) |
| `components/OfferComposer.tsx:205`, `:220` | `<Text>` budget context / current offer | direct |
| `components/JobFilterSheet.tsx:112` | `<Text>` "$X+" filter chips | direct |

### 6.5 Empty states

| Component/site | file:line | What it renders | Used by |
|---|---|---|---|
| `EmptyState` | `ui/primitives/EmptyState.tsx:31` | Glyph circle + title + body + one action button; `neutral`/`attention` tones | Only `ui/templates/ScreenStates.tsx` and `dev-tools/ComponentCatalog.tsx:347` — no screen imports it directly |
| `ScreenStateView` empty variant | `ui/templates/ScreenStates.tsx:78-87` | Delegates to `EmptyState` with defaults | Screens passing `{kind:'empty'}` via templates: `ApproveOrDisputeScreen:98,112`, `BidDetailScreen:70`, `CheckoutScreen:84,104`, `CompareBidsScreen:59`, `JobConfirmedScreen:77`, `NotificationsScreen:124`, `RouteArrivalScreen:73`, `ReviewAndTipScreen:145,159,175`, `SavedWorkersScreen:93`, `TrackWorkerScreen:86,100`, `WorkChecklistScreen:72` |
| Ad-hoc icon+title+body empty view | `screens/AdminReportsScreen.tsx:201-211` | icon circle, "Nothing to review", body | AdminReportsScreen |
| Ad-hoc | `screens/BrowseJobsScreen.tsx:414-420` (locked) | icon circle, "No open jobs right now", body | BrowseJobsScreen |
| Ad-hoc | `screens/CellJobsScreen.tsx:127-133` | icon circle, "No jobs here anymore", body | CellJobsScreen |
| Ad-hoc | `screens/ChatScreen.tsx:1093-1099` | icon circle, "Say hello", body | ChatScreen |
| Ad-hoc (two) | `screens/ClientJobDetailScreen.tsx:560-567`, `:577-585` | bids error / no-bids-yet views, icon circle + title + body | ClientJobDetailScreen |
| Ad-hoc | `screens/MessagesInboxScreen.tsx:377-383` | icon circle, "No messages yet", body | MessagesInboxScreen |
| Ad-hoc | `screens/MyJobsHubScreen.tsx:299-316` | icon circle, "Nothing here yet", body, CTA button | MyJobsHubScreen |
| Ad-hoc | `screens/ProfileReviewsScreen.tsx:176-182` | icon circle, "No reviews yet", body | ProfileReviewsScreen |
| Ad-hoc (two) | `screens/WorkerResultsScreen.tsx:244-250`, `:261-275` | filters-empty and results-empty views | WorkerResultsScreen |
| Ad-hoc card | `screens/WorkChecklistScreen.tsx:184-188` | `emptyCard` "Plan the job in steps" (in addition to its template `{kind:'empty'}` at `:72`) | WorkChecklistScreen |
| Plain-text empty | `screens/HomeScreen.tsx:392-394` (locked) | one `<Text>` sentence | HomeScreen |
| Plain-text empty | `screens/WorkerHomeScreen.tsx:347-349` | one `<Text>` sentence (same copy as HomeScreen's) | WorkerHomeScreen |
| Plain-text empty | `screens/EarningsScreen.tsx:120-122` | `<Text>` sentence | EarningsScreen |
| Missing-job full state | `screens/ClientJobDetailScreen.tsx:1418-1450` (styles) | icon circle + title + body + button | ClientJobDetailScreen |
| `SearchStateCard` (screen-local) | `screens/WorkerSearchScreen.tsx:381` | Card-shaped state surface: icon/spinner circle, eyebrow, title, message | WorkerSearchScreen idle/error/no-results |
| Component-local empties | `components/PastWork.tsx:129-132`, `components/PortfolioPicker.tsx:317`, `components/CountryPicker.tsx:166`, `components/HotspotMap.native.tsx:193-205` | text or banner "nothing here" treatments | their own components |

Overlap: the ad-hoc screen empties in AdminReports, BrowseJobs, CellJobs,
Chat, ClientJobDetail, MessagesInbox, MyJobsHub, ProfileReviews, and
WorkerResults all render the same shape as `EmptyState` (tinted icon circle +
bold title + muted body), each with its own local
`emptyIcon`/`emptyTitle`/`emptyText` StyleSheet entries.

### 6.6 Other concepts implemented more than once

| Concept | Implementations (file:line) | Factual overlap |
|---|---|---|
| Star ratings | `components/StarRating.tsx:11` (5-star icon row, read-only or tappable); inline star-icon+number rows: `screens/CompareBidsScreen.tsx:144-153`, `components/OfferCard.tsx:177-193`, `screens/WorkerProfileScreen.tsx:222-224`, `screens/WorkerSearchScreen.tsx:461-471`, `screens/ProfileReviewsScreen.tsx:163`; text-glyph `"★ n.n (count)"` strings: `screens/BidDetailScreen.tsx:192-197`, `screens/ProfileScreen.tsx:343`, `screens/SavedWorkersScreen.tsx:119-124` | Three presentation families (component, icon+number row, ★-text string) all render `rating_avg`/`rating_count`; the icon+number rows each re-implement the `> 0 ? avg.toFixed(1) : 'New'` branch |
| Segmented tab control | `components/SegmentedControl.tsx:13` (used: `ClientJobDetailScreen:611`, `CompareBidsScreen:75`, `NotificationSettingsScreen:243`, `ProfileScreen:491`; aliased as `SegmentedTabs` at `ui/primitives/index.ts:44-45`, used `ui/templates/ListScreen.tsx:91`); screen-local `FilterTabs` `screens/MyJobsHubScreen.tsx:60-91` | Both render a row of mutually exclusive pressable tabs with a highlighted selected segment |
| Section headers | `components/SectionHeader.tsx:25` (title + optional trailing action — no import site found anywhere in the repo; verified by grep); `SectionHeading` `screens/MyJobsHubScreen.tsx:93` (title + count pill); `DetailScreen` template section titles `ui/templates/DetailScreen.tsx:80-85`; inline title+"View all" header rows `screens/HomeScreen.tsx:345-372` (locked) and `screens/WorkerHomeScreen.tsx:321-332` | Four renderings of "section title with optional trailing accessory"; the shared component has zero users |
| Search bars | `ui/primitives/SearchBar.tsx:39` (used only by `ui/templates/ListScreen.tsx:84` — a template no screen uses — and the dev catalog; verified by grep); inline pill search fields: `screens/HomeScreen.tsx:243` (locked), `screens/BrowseJobsScreen.tsx:259-280` (locked), `screens/WorkerHomeScreen.tsx:235-256`, `screens/WorkerSearchScreen.tsx:199-230` | Four inline `TextInput`-in-pill implementations (icon + input + trailing control) exist alongside the unused shared primitive; WorkerHome's comment (`:408`) states it copies the locked 48's values |
| Skeleton / loading shimmer | `components/Skeleton.tsx` (base pulse block); `WorkerJobCardSkeleton` `components/WorkerJobCard.tsx:159`; screen-local skeleton card `screens/HomeScreen.tsx:376-382` (locked); template skeleton rows `ui/templates/ScreenStates.tsx:70-76`; orphan skeleton styles `components/BrowseJobCard.tsx:199-209` (no renderer in file) | Three distinct card-shaped skeleton layouts built from the same base `Skeleton` |
| Worker identity row (avatar + name + rating + verification) | `components/OfferCard.tsx:154-215`; `CompareRow` `screens/CompareBidsScreen.tsx:105-177`; `screens/BidDetailScreen.tsx:180-204`; `WorkerResultCard` `screens/WorkerSearchScreen.tsx:429-506`; row renderer `screens/SavedWorkersScreen.tsx:101-152`; profile header `screens/WorkerProfileScreen.tsx:187-224` | Six sites each compose `Avatar`/`AvatarPressable` + name + rating treatment (+ `VerificationBadge` in four of them) with local styles |
| "POTENTIAL EARNINGS" stat tile | `screens/BrowseJobsScreen.tsx:313-329` (locked, inside the availability banner); `screens/WorkerHomeScreen.tsx:276-286` (`earningsCard`) | Both render the "POTENTIAL EARNINGS" eyebrow, `formatBudget` total with `'$0'` zero-case, and an "across N jobs" caption |
| Category glyph block (tinted square + `JOB_CATEGORY_ICONS` icon) | `components/BrowseJobCard.tsx:77-79`, `components/WorkerJobCard.tsx:93-95`, `ui/primitives/JobCard.tsx:125-127`, `screens/HomeScreen.tsx:475-481` (locked), `components/HubCard.tsx:86-89`, `components/MarketJobPreview.tsx:62-67`, `screens/JobDetailScreen.tsx:515-521` | Seven sites render `categoryAccent(category).bg` container + `JOB_CATEGORY_ICONS[category] ?? 'ellipsis-horizontal'` glyph |
| Mode-switch pill | `screens/HomeScreen.tsx:212` (styles `:556`, locked), `screens/WorkerHomeScreen.tsx:222` (styles `:394`), `screens/BrowseJobsScreen.tsx:231` (styles `:470`, locked) | Three inline implementations of the outlined switch-mode pill (HomeScreen/WorkerHomeScreen gold border; BrowseJobsScreen forest border, per its own comment) |
