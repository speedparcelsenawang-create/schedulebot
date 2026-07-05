const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'custom-commands.json');

const ALLOWED_CATEGORIES = ['General', 'Greeting', 'Info', 'Utility', 'Fun', 'Media', 'Other'];
const ALLOWED_MEDIA_TYPES = ['image', 'video', 'audio', 'document'];
const DEFAULT_COMMANDS = [
  {
    trigger: '.alive',
    response: '✅ Bot is alive and running.',
    description: 'Check bot online status quickly',
    category: 'Utility',
    createdAt: new Date().toISOString(),
  },
];

function loadCommands() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function persistCommands() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(commands, null, 2));
  } catch (error) {
    console.error('[CustomCommandStore] Failed to persist commands:', error.message);
  }
}

const commands = loadCommands();

function ensureDefaultCommands() {
  let changed = false;

  for (const fallback of DEFAULT_COMMANDS) {
    const key = normalizeTrigger(fallback.trigger);
    if (!key) continue;

    const exists = commands.some((item) => item.trigger === key);
    if (exists) continue;

    commands.push({
      trigger: key,
      response: String(fallback.response || '').trim(),
      description: String(fallback.description || '').trim(),
      category: normalizeCategory(fallback.category),
      createdAt: fallback.createdAt || new Date().toISOString(),
    });
    changed = true;
  }

  if (changed) {
    persistCommands();
  }
}

ensureDefaultCommands();

function normalizeCategory(value) {
  const raw = String(value || '').trim();
  return ALLOWED_CATEGORIES.includes(raw) ? raw : 'General';
}

function normalizeTrigger(value) {
  const clean = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  return clean;
}

function normalizeButtons(buttons) {
  if (buttons == null || buttons === '') return undefined;

  let parsed = buttons;
  if (typeof parsed === 'string') {
    const raw = parsed.trim();
    if (!raw) return undefined;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error('Buttons must be valid JSON');
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Buttons must be an array');
  }

  const cleaned = parsed
    .filter((item) => item && typeof item === 'object' && item.name)
    .map((item) => ({
      name: String(item.name),
      buttonParamsJson:
        typeof item.buttonParamsJson === 'string'
          ? item.buttonParamsJson
          : JSON.stringify(item.buttonParamsJson || {}),
    }));

  return cleaned.length ? cleaned : undefined;
}

function listCommands() {
  return [...commands];
}

function findCommand(trigger) {
  const key = normalizeTrigger(trigger);
  return commands.find((item) => item.trigger === key) || null;
}

function matchCommand(text) {
  const lower = String(text || '').trim().toLowerCase();
  if (!lower) return null;

  return (
    commands.find((item) => {
      return lower === item.trigger || lower.startsWith(`${item.trigger} `);
    }) || null
  );
}

function createCommand(payload) {
  const { trigger, response, description, category, mediaUrl, mediaType, fileName, buttons } = payload;

  const cleanTrigger = normalizeTrigger(trigger);
  if (!cleanTrigger) throw new Error('Trigger is required');
  if (!cleanTrigger.startsWith('.')) {
    throw new Error('Trigger must start with a dot (example: .hello)');
  }

  if (!response && !mediaUrl) {
    throw new Error('At least a response text or media URL is required');
  }

  if (findCommand(cleanTrigger)) {
    throw new Error(`Command ${cleanTrigger} already exists`);
  }

  const entry = {
    trigger: cleanTrigger,
    response: String(response || '').trim(),
    description: String(description || '').trim(),
    category: normalizeCategory(category),
    createdAt: new Date().toISOString(),
  };

  if (mediaUrl && String(mediaUrl).trim()) {
    const type = String(mediaType || 'image').trim();
    if (!ALLOWED_MEDIA_TYPES.includes(type)) {
      throw new Error('Invalid media type');
    }
    entry.mediaUrl = String(mediaUrl).trim();
    entry.mediaType = type;
  }

  if (fileName && String(fileName).trim()) {
    entry.fileName = String(fileName).trim();
  }

  const parsedButtons = normalizeButtons(buttons);
  if (parsedButtons) entry.buttons = parsedButtons;

  commands.push(entry);
  persistCommands();
  return entry;
}

function updateCommand(trigger, payload) {
  const key = normalizeTrigger(trigger);
  const target = commands.find((item) => item.trigger === key);
  if (!target) throw new Error('Command not found');

  const { response, description, category, mediaUrl, mediaType, fileName, buttons } = payload;

  if (!response && !mediaUrl) {
    throw new Error('At least a response text or media URL is required');
  }

  target.response = String(response || '').trim();
  target.description = String(description || '').trim();
  target.category = normalizeCategory(category);

  if (mediaUrl && String(mediaUrl).trim()) {
    const type = String(mediaType || 'image').trim();
    if (!ALLOWED_MEDIA_TYPES.includes(type)) {
      throw new Error('Invalid media type');
    }
    target.mediaUrl = String(mediaUrl).trim();
    target.mediaType = type;
  } else {
    delete target.mediaUrl;
    delete target.mediaType;
  }

  if (fileName && String(fileName).trim()) {
    target.fileName = String(fileName).trim();
  } else {
    delete target.fileName;
  }

  const parsedButtons = normalizeButtons(buttons);
  if (parsedButtons) target.buttons = parsedButtons;
  else delete target.buttons;

  persistCommands();
  return target;
}

function removeCommand(trigger) {
  const key = normalizeTrigger(trigger);
  const index = commands.findIndex((item) => item.trigger === key);
  if (index === -1) return false;

  commands.splice(index, 1);
  persistCommands();
  return true;
}

module.exports = {
  ALLOWED_CATEGORIES,
  ALLOWED_MEDIA_TYPES,
  listCommands,
  findCommand,
  matchCommand,
  createCommand,
  updateCommand,
  removeCommand,
};
