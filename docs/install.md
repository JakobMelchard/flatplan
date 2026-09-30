# Install & use

flatplan runs at [docs.melchard.org/flatplan](https://docs.melchard.org/flatplan/). Nothing to
sign up for; the browser is the app.

## Add to the home screen

On the iPad open the link in Safari, then Share → **Add to Home Screen**. The icon opens flatplan
full screen without browser chrome, which is what the touch layout is designed for. On desktop
browsers the install prompt in the address bar does the same.

The service worker behind this only registers on HTTPS or localhost, so an installed copy from a
plain HTTP dev server will not work offline.

## Offline

Once installed, the app shell is cached and opens without a network. Loading is network first: a
new version is picked up on the next start when you are online, otherwise the cached one runs.

## Updates

An app opened from the home screen resumes where it was instead of reloading. Whenever it comes
back to the foreground it checks which version is deployed; if that differs from the one running
you get an **Update available** notice with a reload button. The version is also shown at the
bottom of the properties panel.

## Layout

- Top bar: tools, layout switcher, zoom and fit, export and import.
- Left: the furniture catalog with the form to add pieces.
- Right: properties of the selection, plan settings, shortcuts.
- Bottom: current mode, a hint for the next step, the cursor position in cm.

Below 1200 px width the side panels become drawers, opened from the buttons at both ends of the
header.

## Your data

Projects live in the browser's IndexedDB on that device (see [Layouts & data](layouts.md)). No
server sees them. Export a JSON to move a project to another device or to keep a backup.
