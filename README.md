# Directory Archive

`darchive` archives files from configured source directories into dated archive folders.

Instead of being hardcoded to Desktop, you define named directory configs once and run:

```shell
darchive desktop
```

## Features

- Works with any source directory
- User-level config stored at `~/.darchive-config.json`
- Interactive setup and edit flows using clack prompts
- Safe file handling: never overwrites existing files
- Progress spinner with conflict reporting

## Install

1. Clone this repo
2. `cd` into the repo
3. Link globally:

```shell
npm link
```

## Quick Start

1. Run interactive setup:

```shell
darchive init
```

2. Add a config key (for example `desktop`) with values such as:
   - source: `~/Desktop`
   - archive base: `~/home/archive/desktop`

3. Run an archive by key:

```shell
darchive desktop
```

This creates a dated folder under your configured archive base, for example:

```text
~/home/archive/desktop/20260417/
```

## Commands

```shell
darchive <key>              # archive using a configured key
darchive init               # interactive config setup
darchive edit [key]         # edit all configs, or one config by key
darchive list               # list configured keys
darchive config path        # print config file location
```

You can also use:

```shell
darchive config init
darchive config edit [key]
darchive config list
```

## Config Format

The CLI stores config at `~/.darchive-config.json`.

```json
{
  "directories": {
    "desktop": {
      "sourcePath": "~/Desktop",
      "archivePath": "~/home/archive/desktop"
    },
    "downloads": {
      "sourcePath": "~/Downloads",
      "archivePath": "~/home/archive/downloads"
    }
  }
}
```

Note: The CLI can read older array-style `directories` values, but it writes the normalized object format shown above.

## Edit Workflow

`darchive edit` steps through each configured key and prompts for:

- key name
- source path
- archive path

Each prompt is pre-filled with the existing value. Press Enter to keep that value.

## Archive Behavior

- Archives non-hidden items from the source directory root
- Skips hidden files/folders (names starting with `.`)
- Skips files that already exist at the destination (reports as conflicts)
- If archive base is a direct child of source, that archive folder is excluded automatically

## Notes

- Paths can use `~` for home directory
- If you run `darchive <key>` before any config exists, the CLI offers to launch setup
