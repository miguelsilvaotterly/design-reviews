# Send to Design Reviews — Chrome extension

One click on any Otterly screen → the page is captured at your display's pixel ratio and opened as a new screen in Design reviews, in edit mode, ready for markers.

## Install (once, no Web Store needed)

1. Download this `extension` folder to your Mac (from GitHub: Code → Download ZIP, then unzip; the folder is `design-reviews/extension`).
2. In Chrome open `chrome://extensions`, turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the `extension` folder.
4. Pin the pink icon from the puzzle-piece menu.

You must be signed in to Design reviews in the same Chrome profile — the extension uses that session. If the popup says "Sign in", click its button, sign in, and try again.

## Use

Open the production screen you want to review, click the icon, pick the review (or "+ New review…"), optionally type a screen name, and hit **Capture & open**.

- **Full page** (default) captures everything from top to bottom in one shot. Chrome shows a "… is debugging this browser" bar for a second — that's the mechanism, not a problem.
- Untick it to capture only what's visible.

The new screen opens in a tab with the screenshot already in the Production slot. Paste the Figma link, and if `FIGMA_TOKEN` is configured in the deployment the Design image is fetched automatically.

## Settings

The gear link in the popup lets you point the extension at `http://localhost:3000` while developing the app.
