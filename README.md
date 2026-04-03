# Desktop Archive

Ever want to tidy up your Desktop but don't have time to sift through files?

Enter `archivedt`, a simple CLI tool to automatically archive your Desktop files into dated folders.

## What it Does

Archives all files and folders from `~/Desktop` into `~/Desktop/Archive/YYYYMMDD` (e.g., `~/Desktop/Archive/20260402`).

### Features

- 🚀 **Fast** (ish) – Uses native Node.js file operations
- 🎨 **Pretty UI** – Uses clack prompts with animated spinner and color-coded messages
- 🔒 **Safe** – Never overwrites existing files
- 📊 **Progress tracking** – Shows real-time percentage and item count during long runs
- ⚠️ **Conflict reporting** – Clearly lists any files skipped due to naming conflicts

## Getting Started

1. Clone the repo

2. `cd` into your local copy

3. Run `npm link` to enable to be run globally:
```shell
npm link
```

4. Now you can run the CLI anywhere:

```shell
archivedt
```

> [!NOTE]
> If you want to modify the command name, just change the key within 'bin' in `package.json`.

## Behavior

### What gets archived
- ✅ All files and folders at the root of `~/Desktop`
- ❌ Excludes the `Archive` folder itself
- ❌ Excludes hidden files (starting with `.`)

### Archive folder structure
```
~/Desktop/
  └── Archive/
      └── 20260402/          ← Today's date (YYYYMMDD)
          ├── file.txt      ← Your archived files
          ├── folder1/
          └── image.png
```

### Running multiple times per day

**Safe to run multiple times on the same day**—the script checks if files with the same name already exist in today's archive folder:

- **If file doesn't exist**: Moves the file from Desktop → Archive
- **If file already exists**: Skips the file and reports it as a naming conflict

**Example scenario:**
1. First run at 9am: Moves `report.pdf` to `Archive/20260402/report.pdf` ✓
2. You download a new file also named `report.pdf` to Desktop
3. Second run at 5pm: 
   - Leaves the original `report.pdf` in the archive folder (won't overwrite)
   - Leaves the new `report.pdf` on Desktop (won't move)
   - Reports `report.pdf` as a naming conflict

This **prevents accidental data loss** - you decide manually how to handle files with duplicate names.
