## Why

Users have no way to customize the application's appearance and no mechanism to reach a settings area. Adding a Preferences page with a dark mode toggle gives users a persistent visual preference and establishes a home for future settings.

## What Changes

- A new "Settings" section is added to the hamburger menu accordion, available to all logged-in users. It contains a "Preferences" item that navigates to `/preferences`.
- A new `/preferences` route is introduced, accessible to all authenticated users. It presents a dark mode toggle that takes effect immediately and persists across sessions via `localStorage`.
- Dark mode is fully implemented: toggling the switch applies or removes the `dark` class on `<html>`, activating the dark color-scheme CSS variables already defined in `index.css`.
- A FOUC-prevention script is added to `index.html` so the correct theme is applied before React boots.

## Capabilities

### New Capabilities

- `preferences/user-preferences`: Behavioral contract for the user preferences page — accessibility, dark mode toggle, and persistence behavior.

### Modified Capabilities

- `navigation/app-menu`: Add the Settings accordion section and the Preferences shelf item.

## Impact

- `apps/web/src/components/AppHeader.tsx` — new Settings section in accordion
- `apps/web/src/routes/preferences.tsx` — new route (new file)
- `apps/web/src/lib/useTheme.ts` — new ThemeContext, ThemeProvider, useTheme hook (new file)
- `apps/web/src/main.tsx` — wrap app in ThemeProvider
- `apps/web/index.html` — inline FOUC-prevention script
- shadcn Switch component installed into `apps/web/src/components/ui/switch.tsx`
- No API or database changes required
