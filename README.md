# zach-to-girlfriend

A small personalized "1 Month Anniversary" website for a couple (Zach & Holly), built as a set of static HTML pages with vanilla JavaScript and a [Supabase](https://supabase.com) backend for shared, real-time-ish state (mood syncing) and photo storage.

## Pages

- **`index.html`** — The main landing page.
  - Plays an intro animation on first visit (two eyes opening, styled as "the page waking up"), then reveals the page content. The intro is skipped on repeat visits via a `localStorage` flag.
  - Displays a "Zach & Holly" header with the relationship start date.
  - **Mood picker**: 8 selectable moods (Happy, Tired, Sad, Mad, Hungry, Sleepy, Excited, Naughty). Selecting a mood:
    - Changes the page's background gradient and accent colors.
    - Shows a matching message in a speech bubble.
    - Spawns floating, mood-themed emoji particles that drift up the screen.
    - Saves the mood to `localStorage` and pushes it to a Supabase table (`mood_state`) so it can be read by the other pages.
  - **Shared photo gallery**: either partner can upload a photo via a file picker. Photos are uploaded to a public Supabase Storage bucket (`gallery-photos`) and the gallery re-renders the list of uploaded images for both people to see. Includes basic client-side validation (image type, 10MB size limit) and upload status messaging.
  - Links to `playground.html` ("Visit our Playground") and, more faintly, to `zach.html` ("Zach's secret view").

- **`playground.html`** — An interactive page featuring a roaming animated face (just eyes and a mouth on a circle — no body) that reacts to touch/click:
  - Tapping elsewhere on the screen moves the face there.
  - Poking the face (a plain tap on it) triggers a blink/poke reaction.
  - Tickling the cheeks triggers a squirming/giggling reaction.
  - Booping the chin triggers an embarrassed "duck and hide" reaction.
  - Tapping the eyes makes the face flee to a random screen corner.
  - Dragging across the face makes it blush.
  - The face's expression mirrors whatever mood is currently set on the main page, kept in sync via Supabase polling (every 4 seconds) and `localStorage`.
  - Links back to `index.html`.

- **`zach.html`** — A private, read-only view (linked faintly from the main page as "Zach's secret view") that displays Holly's currently-set mood, polling the same Supabase `mood_state` table every 4 seconds to show a near-real-time mood, a matching face illustration, a suggested response message, and a "time ago" timestamp of the last update.

- **`bear_test.html`** — A standalone SVG illustration (a gooey-blob bear design test using an SVG goo filter). It is **not linked from any other page** and appears to be leftover design/scratch work rather than part of the live site.

## Tech stack

- Static HTML, CSS, and vanilla JavaScript — no build step, bundler, or package manager (no `package.json` in this repo).
- [Google Fonts](https://fonts.google.com/) — `Baloo 2` and `Quicksand`, loaded via `<link>` tags.
- [Supabase](https://supabase.com) for the backend:
  - **PostgREST table (`mood_state`)** — stores the single current mood (row `id: 1`) with an `updated_at` timestamp, read/written via the Supabase REST API (`/rest/v1/mood_state`).
  - **Storage bucket (`gallery-photos`)** — a public bucket used to store and serve uploaded gallery photos via the Supabase Storage REST API (`/storage/v1/object/...`).
  - Each page embeds a `SUPABASE_URL` and `SUPABASE_ANON_KEY`. These are Supabase's public anon keys, which are designed to be used in client-side code — access control is enforced by Supabase Row Level Security policies on the backend, not by keeping the key secret.

## Installation / running locally

This is a purely static site — no build tooling or dependencies to install. To run it locally, serve the directory with any static file server, for example:

```bash
# Python
python -m http.server 8000

# Node (via npx)
npx serve .
```

Then open `http://localhost:8000/index.html` in a browser.

You can also open `index.html` directly as a `file://` URL, though some browsers restrict certain features (like `fetch` requests) for local files, so a local server is recommended.

TODO: Document the exact Supabase schema (columns/types for `mood_state`) and Storage bucket policies needed to stand up a fresh Supabase project for this site, since the current setup connects to an already-configured project.

## Usage

1. Open `index.html`.
2. Watch the intro animation (or skip straight to the page on repeat visits).
3. Pick a mood from the mood picker — the whole page's theme and message will update, and the mood is shared with the other pages via Supabase.
4. Visit `playground.html` to interact with the roaming face.
5. Upload photos to the shared gallery from the main page.
6. (Optional, Zach-only) Visit `zach.html` to check Holly's currently set mood.
