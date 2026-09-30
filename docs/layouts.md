# Layouts & data

## Layouts

A project holds one floor plan, one catalog and any number of layouts: arrangements of the same
furniture over the same plan. The switcher in the top bar creates, duplicates, renames and
deletes layouts, so you can compare two sofa positions without redrawing anything.

## Persistence

Everything is saved to the browser's IndexedDB (database `flatplan`), debounced after each
change. flatplan asks for persistent storage so Safari does not evict it. Projects from older
versions that used localStorage are migrated on first load.

The data never leaves the device on its own. Clearing site data in the browser deletes it.

## Export and import

**Export** writes the whole project as one JSON file: plan, catalog, layouts and images as data
URLs. On the iPad the share sheet opens, so you can Save to Files, AirDrop it, or send it
anywhere. **Import** replaces the current project with such a file.

Use it for backups and to move between devices.
