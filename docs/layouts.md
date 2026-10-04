# Layouts & data

## Layouts

A project holds one floor plan, one catalog and any number of layouts: arrangements of the same
furniture over the same plan. The switcher in the top bar creates, duplicates, renames and
deletes layouts, so you can compare two sofa positions without redrawing anything.

## Persistence

Everything is saved to the browser's IndexedDB (database `flatplan`), debounced after each
change. flatplan asks for persistent storage so Safari does not evict it. Projects from older
versions that used localStorage are migrated on first load.

If the stored project cannot be read at start, flatplan opens a blank project, says so, and saves
nothing until you reload, so the stored project is not overwritten.

The data never leaves the device on its own. Clearing site data in the browser deletes it.

## Export and import

**Export** writes the whole project as one JSON file: plan, catalog, layouts and images as data
URLs. On the iPad the share sheet opens, so you can Save to Files, AirDrop it, or send it
anywhere. **Import** replaces the current project with such a file. A file that is not a
flatplan project is refused; colours other than `#rrggbb` are replaced and images that are not
embedded data URLs are dropped.

Use it for backups and to move between devices.
