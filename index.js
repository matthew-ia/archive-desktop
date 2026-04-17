#!/usr/bin/env node

import { readdir, mkdir, rename, access, readFile, writeFile } from 'fs/promises';
import { join, resolve, dirname, basename } from 'path';
import { homedir } from 'os';
import { constants } from 'fs';
import * as clack from '@clack/prompts';
import pc from 'picocolors';

const CONFIG_PATH = join(homedir(), '.darchive-config.json');

function expandHomePath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') {
    return '';
  }

  if (inputPath === '~') {
    return homedir();
  }

  if (inputPath.startsWith('~/')) {
    return join(homedir(), inputPath.slice(2));
  }

  return inputPath;
}

function tildePath(inputPath) {
  const home = homedir();
  if (inputPath === home) {
    return '~';
  }
  if (inputPath.startsWith(`${home}/`)) {
    return `~/${inputPath.slice(home.length + 1)}`;
  }
  return inputPath;
}

function normalizeDirectories(rawDirectories) {
  if (!rawDirectories) {
    return {};
  }

  if (Array.isArray(rawDirectories)) {
    return rawDirectories.reduce((acc, item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return { ...acc, ...item };
      }
      return acc;
    }, {});
  }

  if (typeof rawDirectories === 'object') {
    return rawDirectories;
  }

  return {};
}

async function loadConfig() {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      directories: normalizeDirectories(parsed.directories)
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { directories: {} };
    }

    throw new Error(`Unable to read config at ${CONFIG_PATH}: ${error.message}`);
  }
}

async function saveConfig(config) {
  const normalized = {
    directories: normalizeDirectories(config.directories)
  };
  await writeFile(CONFIG_PATH, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
}

function isCancel(value) {
  return clack.isCancel(value);
}

function validateKey(value) {
  if (!value) {
    return 'Key is required';
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    return 'Use letters, numbers, underscore, or hyphen only';
  }
  return undefined;
}

function getConfigByKey(config, key) {
  const directories = normalizeDirectories(config.directories);
  const entry = directories[key];
  if (!entry) {
    return null;
  }

  return {
    key,
    sourcePath: expandHomePath(entry.sourcePath),
    archivePath: expandHomePath(entry.archivePath)
  };
}

// Get current date in YYYYMMDD format
function getDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

async function archiveDirectory(configKey, sourcePath, archiveBasePath) {
  try {
    const dateString = getDateString();
    const resolvedSourcePath = resolve(sourcePath);
    const resolvedArchiveBasePath = resolve(archiveBasePath);
    const archivePath = join(resolvedArchiveBasePath, dateString);
    const archiveFolderName =
      dirname(resolvedArchiveBasePath) === resolvedSourcePath ? basename(resolvedArchiveBasePath) : null;
    
    // Ensure archive folder exists
    await mkdir(archivePath, { recursive: true });
    
    // Get all items in source directory
    const allItems = await readdir(resolvedSourcePath);
    
    // Filter out hidden files and archive root folder (if archive is inside source)
    const itemsToMove = allItems.filter(item => {
      return !item.startsWith('.') && item !== archiveFolderName;
    });

    const introMsg = pc.bold(pc.white(`Directory Archive: ${configKey}`));
    
    const itemCount = itemsToMove.length;
    
    if (itemCount === 0) {
      clack.intro(introMsg);
      clack.log.info(pc.dim('No items to archive'));
      clack.outro(pc.green(`Nothing to move from ${tildePath(resolvedSourcePath)}`));
      return {
        itemCount: 0,
        dateString,
        archivePath,
        sourcePath: resolvedSourcePath
      };
    }
    
    // Start with intro
    clack.intro(introMsg);
    clack.log.step(`Source: ${pc.dim(tildePath(resolvedSourcePath))}`);
    clack.log.step(`Archive: ${pc.dim(tildePath(archivePath))}`);
    
    // Create spinner
    const s = clack.spinner();
    s.start(`Archiving ${itemCount} item(s)`);
    
    // Track moved and conflicted items
    let movedCount = 0;
    const conflicts = [];
    
    // Move each item with spinner progress
    for (let i = 0; i < itemCount; i++) {
      const item = itemsToMove[i];
      const sourcePathForItem = join(resolvedSourcePath, item);
      const targetPath = join(archivePath, item);
      
      const percent = Math.round(((i + 1) / itemCount) * 100);
      s.message(`${percent}% complete (${i + 1}/${itemCount})`);
      
      // Check if target file already exists
      try {
        await access(targetPath, constants.F_OK);
        // File exists - skip and record conflict
        conflicts.push(item);
      } catch {
        // File doesn't exist - move it
        await rename(sourcePathForItem, targetPath);
        movedCount++;
      }
    }
    
    s.stop(`Archived ${movedCount} item(s)`);
    
    // Log conflicts if any
    if (conflicts.length > 0) {
      clack.log.error(pc.gray(`${conflicts.length} file(s) skipped due to naming conflicts`));
      let conflictList = '';
      conflicts.forEach((file, i) => {
        conflictList += i === 0 ? '' : '\n';
        conflictList += ` - ${file}`;
      });
      clack.note(conflictList, pc.gray(`Skipped files`));
    }
    
    // Final completion message
    if (movedCount > 0) {
      clack.outro(pc.green(`Done ✓ ${pc.dim(tildePath(archivePath))}`));
    } else if (conflicts.length > 0) {
      clack.outro(pc.gray('No new items moved (all had conflicts)'));
    }
    
    return {
      itemCount: movedCount,
      dateString,
      archivePath,
      sourcePath: resolvedSourcePath,
      conflicts
    };
    
  } catch (error) {
    clack.cancel(pc.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

async function promptDirectoryValues(existingKey = '', existingEntry = null) {
  const keyPrompt = await clack.text({
    message: 'Config key name',
    placeholder: 'desktop',
    initialValue: existingKey,
    validate: validateKey
  });

  if (isCancel(keyPrompt)) {
    clack.cancel('Cancelled');
    process.exit(0);
  }

  const sourcePrompt = await clack.text({
    message: 'Source directory path',
    placeholder: '~/Desktop',
    initialValue: existingEntry?.sourcePath ?? '',
    validate: value => (value ? undefined : 'Source path is required')
  });

  if (isCancel(sourcePrompt)) {
    clack.cancel('Cancelled');
    process.exit(0);
  }

  const archivePrompt = await clack.text({
    message: 'Archive base directory path',
    placeholder: '~/archive/desktop',
    initialValue: existingEntry?.archivePath ?? '',
    validate: value => (value ? undefined : 'Archive path is required')
  });

  if (isCancel(archivePrompt)) {
    clack.cancel('Cancelled');
    process.exit(0);
  }

  return {
    key: String(keyPrompt).trim(),
    sourcePath: String(sourcePrompt).trim(),
    archivePath: String(archivePrompt).trim()
  };
}

async function runConfigInit() {
  clack.intro(pc.bold(pc.white('darchive: config setup')));

  const config = await loadConfig();
  const directories = normalizeDirectories(config.directories);

  let continueAdding = true;
  while (continueAdding) {
    const values = await promptDirectoryValues();
    directories[values.key] = {
      sourcePath: values.sourcePath,
      archivePath: values.archivePath
    };

    const addAnother = await clack.confirm({
      message: 'Add another directory config?',
      initialValue: true
    });

    if (isCancel(addAnother)) {
      clack.cancel('Cancelled');
      process.exit(0);
    }

    continueAdding = Boolean(addAnother);
  }

  await saveConfig({ directories });
  clack.outro(pc.green(`Saved config to ${CONFIG_PATH}`));
}

async function runConfigEdit(targetKey) {
  const config = await loadConfig();
  const directories = normalizeDirectories(config.directories);
  const keys = Object.keys(directories);

  if (keys.length === 0) {
    clack.intro(pc.bold(pc.white('darchive: edit config')));
    clack.log.warn('No config entries found. Run `darchive init` first.');
    clack.outro(pc.dim(`Config path: ${CONFIG_PATH}`));
    return;
  }

  clack.intro(pc.bold(pc.white('darchive: edit config')));

  let keysToEdit = keys;
  if (targetKey) {
    if (!directories[targetKey]) {
      clack.cancel(pc.red(`Unknown config key: ${targetKey}`));
      process.exit(1);
    }
    keysToEdit = [targetKey];
  }

  for (const key of keysToEdit) {
    const existing = directories[key];
    clack.note(
      `sourcePath: ${existing.sourcePath}\narchivePath: ${existing.archivePath}`,
      `Editing ${key}`
    );

    const updated = await promptDirectoryValues(key, existing);
    if (updated.key !== key && directories[updated.key]) {
      clack.cancel(pc.red(`Key '${updated.key}' already exists. Edit aborted.`));
      process.exit(1);
    }

    delete directories[key];
    directories[updated.key] = {
      sourcePath: updated.sourcePath,
      archivePath: updated.archivePath
    };
  }

  await saveConfig({ directories });
  clack.outro(pc.green(`Updated config at ${CONFIG_PATH}`));
}

async function runConfigList() {
  const config = await loadConfig();
  const directories = normalizeDirectories(config.directories);
  const keys = Object.keys(directories);

  clack.intro(pc.bold(pc.white('darchive: view configured directories')));

  if (keys.length === 0) {
    clack.log.info('No configured directories yet. Run `darchive init`.');
    clack.outro(pc.dim(`Config path: ${CONFIG_PATH}`));
    return;
  }

  const rows = keys
    .sort()
    .map(key => {
      const entry = directories[key];
      return `${pc.bold(key)}\n  source: ${pc.dim(entry.sourcePath)}\n  archive: ${pc.dim(entry.archivePath)}`;
    })
    .join('\n\n');

  clack.note(rows, 'Configured keys');
  clack.outro(pc.dim(`Config path: ${CONFIG_PATH}`));
}

function printHelp() {
  const help = [
    'Usage:',
    '  darchive                    Choose a configured directory from a prompt',
    '  darchive <key>              Archive a configured directory',
    '  darchive init               Interactive setup for directory configs',
    '  darchive edit [key]         Edit all configs or a single config',
    '  darchive list               List configured directory keys',
    '  darchive config path        Print config file path',
    '',
    'Examples:',
    '  darchive desktop',
    '  darchive init',
    '  darchive edit desktop'
  ].join('\n');

  console.log(help);
}

async function promptForDirectoryKey(config) {
  const directories = normalizeDirectories(config.directories);
  const keys = Object.keys(directories).sort();

  const selectedKey = await clack.select({
    message: 'Choose a directory config to archive',
    options: keys.map(key => {
      const entry = directories[key];
      return {
        value: key,
        label: key,
        hint: `${entry.sourcePath} → ${entry.archivePath}`
      };
    })
  });

  if (isCancel(selectedKey)) {
    clack.cancel('Cancelled');
    process.exit(0);
  }

  return String(selectedKey);
}

async function maybeBootstrapConfig() {
  const config = await loadConfig();
  const hasConfig = Object.keys(normalizeDirectories(config.directories)).length > 0;
  if (hasConfig) {
    return;
  }

  clack.intro(pc.bold(pc.white('darchive: No directory config found')));
  clack.log.info(`Create your config at ${CONFIG_PATH}`);

  const shouldSetup = await clack.confirm({
    message: 'Run interactive setup now?',
    initialValue: true
  });

  if (isCancel(shouldSetup) || !shouldSetup) {
    clack.outro(pc.dim('Setup skipped. Run `darchive init` when ready.'));
    process.exit(0);
  }

  await runConfigInit();
}

async function main() {
  const args = process.argv.slice(2);
  const [command, subcommand] = args;

  if (command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return;
  }

  if (command === 'init') {
    await runConfigInit();
    return;
  }

  if (command === 'edit') {
    await runConfigEdit(subcommand);
    return;
  }

  if (command === 'list') {
    await runConfigList();
    return;
  }

  if (command === 'config' && subcommand === 'path') {
    console.log(CONFIG_PATH);
    return;
  }

  if (command === 'config' && args[1] === 'edit') {
    await runConfigEdit(args[2]);
    return;
  }

  if (command === 'config' && args[1] === 'init') {
    await runConfigInit();
    return;
  }

  if (command === 'config' && args[1] === 'list') {
    await runConfigList();
    return;
  }

  await maybeBootstrapConfig();

  const config = await loadConfig();
  const archiveKey = command || await promptForDirectoryKey(config);
  const target = getConfigByKey(config, archiveKey);

  if (!target) {
    clack.cancel(pc.red(`Unknown key: ${archiveKey}`));
    clack.log.info('Run `darchive list` to see configured keys.');
    process.exit(1);
  }

  await archiveDirectory(target.key, target.sourcePath, target.archivePath);
}

main().catch(error => {
  clack.cancel(pc.red(`Error: ${error.message}`));
  process.exit(1);
});
