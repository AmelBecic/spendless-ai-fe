# Screenshot capture guide

The README references the images below. Capture them from the running app and drop the PNGs in this
folder with these exact filenames. Until they're added, the README's image links show as broken —
so add them before making the repo public.

Run the app (`npm run dev`), sign in, and seed a little data first (log a few transactions + a fixed
expense or two, and refresh the profile/suggestions once with AI mode on) so the screens aren't
empty.

| File                     | Screen           | Notes                                                                                                                         |
| ------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `suggestions.png`        | Suggestions feed | The hero shot for the top of the README. Show a grounded card.                                                                |
| `overview.png`           | `/` overview hub | Signed in, AI mode on so the Suggestions card shows.                                                                          |
| `log.png`                | `/log`           | A couple of transactions + a fixed expense in the ledger.                                                                     |
| `dashboard.png`          | `/dashboard`     | Stat tiles filled in, the "money story" card present.                                                                         |
| `suggestions-detail.png` | `/suggestions`   | Include one **grounded** (teal) and one **degraded** (amber) card side by side if you can — that contrast is the whole point. |

Tips:

- Capture in **light mode** for consistency (the app supports both; pick one for the README so the
  set reads as one system).
- A ~1200px-wide viewport keeps the cards legible without huge files.
- Optional: a second set in dark mode under `*-dark.png` if you want to show off theming later.
