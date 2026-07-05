const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const pino = require('pino');
const baileys = require('atexovi-baileys');

const customCommandStore = require('./customCommandStore');
const { sendInteractiveButtons } = require('../lib/interactiveButtons');

const makeWASocket = baileys.default;
const {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
} = baileys;

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.qrCodeDataUrl = null;
    this.ready = false;
    this.lastStatus = 'Initializing...';
    this.reconnectTimer = null;
    this.isInitializing = false;
    this.reconnectAttempts = 0;
    this.initPromise = null;
    this.authPath = path.join(process.cwd(), '.baileys_auth');
    this.defaultDialCode = String(process.env.DEFAULT_DIAL_CODE || '60').replace(/\D/g, '') || '60';
    this.pairingCode = null;
    this.isRequestingPairingCode = false;
  }

  async init() {
    if (this.initPromise) return this.initPromise;
    if (this.isInitializing) return;

    this.isInitializing = true;
    this.lastStatus = 'Starting WhatsApp client...';

    this.initPromise = this.startSocket()
      .catch((error) => {
        this.lastStatus = `Initialization failed: ${error.message}`;
        this.ready = false;
        this.isInitializing = false;
        console.error('[WA] Initialization error:', error.message);
        this.scheduleReinitialize('initialize_error');
      })
      .finally(() => {
        this.initPromise = null;
      });

    return this.initPromise;
  }

  async startSocket() {
    fs.mkdirSync(this.authPath, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(this.authPath);

    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch (error) {
      console.warn('[WA] Failed to fetch latest WA version, using fallback');
    }

    const socketLogger = pino({ level: 'silent' });

    this.sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, socketLogger),
      },
      logger: socketLogger,
      browser: ['ScheduleBot', 'Desktop', '1.0.0'],
      printQRInTerminal: false,
      connectTimeoutMs: Number(process.env.WA_CONNECT_TIMEOUT_MS || 60000),
      keepAliveIntervalMs: 15000,
      defaultQueryTimeoutMs: Number(process.env.WA_QUERY_TIMEOUT_MS || 60000),
      version,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('messages.upsert', async (event) => {
      try {
        await this.handleIncomingMessages(event);
      } catch (error) {
        console.error('[WA] Failed to handle incoming message:', error.message);
      }
    });

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrCodeDataUrl = await qrcode.toDataURL(qr);
        this.lastStatus = 'Scan QR from dashboard';
        this.ready = false;
        this.isInitializing = false;
      }

      if (connection === 'connecting' && !qr) {
        this.lastStatus = 'Connecting to WhatsApp...';
      }

      if (connection === 'open') {
        this.lastStatus = 'WhatsApp connected';
        const wasReady = this.ready;
        this.ready = true;
        this.isInitializing = false;
        this.reconnectAttempts = 0;
        this.qrCodeDataUrl = null;
        this.pairingCode = null;
        if (!wasReady) {
          console.log('[WA] Client ready');
        }
      }

      if (connection === 'close') {
        this.ready = false;
        this.isInitializing = false;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
        this.lastStatus = `Disconnected: ${statusCode || 'unknown'}`;
        console.error('[WA] Disconnected event:', statusCode || 'unknown');

        if (isLoggedOut) {
          try {
            fs.rmSync(this.authPath, { recursive: true, force: true });
            fs.mkdirSync(this.authPath, { recursive: true });
          } catch (error) {
            console.error('[WA] Failed to reset auth:', error.message);
          }
          this.qrCodeDataUrl = null;
          this.pairingCode = null;
          this.scheduleReinitialize('logged_out');
          return;
        }

        this.scheduleReinitialize('disconnected');
      }
    });
  }

  scheduleReinitialize(trigger) {
    if (this.reconnectTimer) return;

    this.reconnectAttempts += 1;
    const reconnectDelayMs = Math.min(4000 * (2 ** (this.reconnectAttempts - 1)), 60000);

    this.lastStatus = `Reconnecting after ${trigger} in ${Math.round(reconnectDelayMs / 1000)}s...`;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      try {
        if (this.sock) {
          this.sock.end(new Error('reconnect'));
        }
      } catch (error) {
        console.error('[WA] End socket error:', error.message);
      }

      this.sock = null;
      this.isInitializing = false;
      this.init();
    }, reconnectDelayMs);
  }

  getConnectionState() {
    return {
      ready: this.ready,
      status: this.lastStatus,
      qrCodeDataUrl: this.qrCodeDataUrl,
      pairingCode: this.pairingCode,
    };
  }

  async requestPairingCode(phoneNumber) {
    if (!this.sock) {
      throw new Error('WhatsApp client is not ready yet, please wait a moment');
    }

    if (this.ready) {
      throw new Error('WhatsApp is already connected');
    }

    if (this.sock.authState?.creds?.registered) {
      throw new Error('This session is already registered, restart the connection to re-pair');
    }

    if (this.isRequestingPairingCode) {
      throw new Error('A pairing code request is already in progress');
    }

    const normalized = this.normalizePersonalNumber(phoneNumber);
    if (!normalized || normalized.length < 8) {
      throw new Error('Invalid phone number');
    }

    this.isRequestingPairingCode = true;
    try {
      const code = await this.sock.requestPairingCode(normalized);
      this.pairingCode = code;
      this.lastStatus = 'Enter the pairing code in WhatsApp > Linked Devices';
      return code;
    } finally {
      this.isRequestingPairingCode = false;
    }
  }

  buildChatId(targetType, target) {
    const rawTarget = String(target || '').trim();
    if (!rawTarget) {
      throw new Error('Target cannot be empty');
    }

    if (targetType === 'group') {
      if (rawTarget.endsWith('@g.us')) {
        return rawTarget;
      }

      const normalizedGroup = rawTarget.replace(/[^0-9-]/g, '');
      if (!normalizedGroup) {
        throw new Error('Invalid group ID');
      }

      return `${normalizedGroup}@g.us`;
    }

    if (rawTarget.endsWith('@s.whatsapp.net')) {
      return rawTarget;
    }

    const normalizedPhone = this.normalizePersonalNumber(rawTarget);
    if (!normalizedPhone) {
      throw new Error('Invalid destination number');
    }

    return `${normalizedPhone}@s.whatsapp.net`;
  }

  normalizePersonalNumber(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) return '';

    if (rawValue.endsWith('@s.whatsapp.net')) {
      return rawValue.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
    }

    const digitsOnly = rawValue.replace(/\D/g, '');
    if (!digitsOnly) return '';

    if (digitsOnly.startsWith('0')) {
      return `${this.defaultDialCode}${digitsOnly.slice(1)}`;
    }

    if (digitsOnly.startsWith(this.defaultDialCode)) {
      return digitsOnly;
    }

    return digitsOnly;
  }

  async sendMessage(targetType, target, message) {
    if (!this.sock || !this.ready) {
      throw new Error('WhatsApp client is not ready');
    }

    let chatId = this.buildChatId(targetType, target);
    if (targetType === 'personal') {
      const result = await this.sock.onWhatsApp(chatId);
      if (!Array.isArray(result) || !result[0] || !result[0].exists) {
        throw new Error('Destination number is not registered on WhatsApp');
      }

      chatId = result[0].jid || chatId;
    }

    console.log(`[WA] Sending message to ${chatId}`);
    await this.sock.sendMessage(chatId, { text: String(message || '') });
  }

  async handleIncomingMessages(event) {
    if (!this.sock || event.type !== 'notify') return;

    for (const message of event.messages || []) {
      if (!message?.message || message.key?.fromMe) continue;

      const chatId = message.key?.remoteJid;
      if (!chatId) continue;

      const content = normalizeMessageContent(message.message) || message.message;

      const text =
        content.conversation ||
        content.extendedTextMessage?.text ||
        content.imageMessage?.caption ||
        content.videoMessage?.caption ||
        '';

      const matched = customCommandStore.matchCommand(text);
      if (!matched) continue;

      await this.replyWithCustomCommand(chatId, matched, message);
    }
  }

  async replyWithCustomCommand(chatId, command, quotedMessage) {
    const caption = String(command.response || '').replace(/\\n/g, '\n');
    const options = { quoted: quotedMessage };

    if (command.mediaUrl && command.mediaType) {
      const mediaSource = { url: command.mediaUrl };
      const fileName = command.fileName || 'file';
      const hasButtons = Boolean(command.buttons && command.buttons.length);

      if (hasButtons) {
        await sendInteractiveButtons(
          this.sock,
          chatId,
          { text: caption || 'Choose an option:', buttons: command.buttons },
          options
        );
      }

      const payload = hasButtons ? {} : { caption };

      if (command.mediaType === 'image') {
        await this.sock.sendMessage(chatId, { image: mediaSource, ...payload }, hasButtons ? {} : options);
      } else if (command.mediaType === 'video') {
        await this.sock.sendMessage(chatId, { video: mediaSource, ...payload }, hasButtons ? {} : options);
      } else if (command.mediaType === 'audio') {
        await this.sock.sendMessage(
          chatId,
          { audio: mediaSource, mimetype: 'audio/mpeg', ptt: false, ...payload },
          hasButtons ? {} : options
        );
      } else if (command.mediaType === 'document') {
        await this.sock.sendMessage(
          chatId,
          { document: mediaSource, fileName, mimetype: 'application/octet-stream', ...payload },
          hasButtons ? {} : options
        );
      }
      return;
    }

    if (caption) {
      await sendInteractiveButtons(this.sock, chatId, { text: caption, buttons: command.buttons }, options);
    }
  }

  async listGroups() {
    if (!this.sock || !this.ready) {
      throw new Error('WhatsApp client is not ready');
    }

    const groupsMap = await this.sock.groupFetchAllParticipating();
    return Object.values(groupsMap)
      .map((group) => ({
        id: group.id || '',
        name: group.subject || 'Untitled',
      }))
      .filter((group) => group.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }
}

module.exports = new WhatsAppService();
