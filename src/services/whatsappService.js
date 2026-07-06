const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const pino = require('pino');
const baileys = require('atexovi-baileys');

const customCommandStore = require('./customCommandStore');
const deletedMessageStore = require('./deletedMessageStore');
const { sendInteractiveButtons } = require('../lib/interactiveButtons');

const uploadDir = path.join(process.cwd(), 'uploads');

const makeWASocket = baileys.default;
const {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
  normalizeMessageContent,
  downloadContentFromMessage,
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
    this.store = null;
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
    if (!this.store) {
      this.store = makeInMemoryStore({ logger: socketLogger });
    }

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
    const currentSocket = this.sock;

    this.store.bind(currentSocket.ev);

    currentSocket.ev.on('creds.update', saveCreds);

    currentSocket.ev.on('messages.upsert', async (event) => {
      try {
        await this.handleIncomingMessages(event);
      } catch (error) {
        console.error('[WA] Failed to handle incoming message:', error.message);
      }
    });

    currentSocket.ev.on('messages.update', async (updates) => {
      try {
        await this.handleMessageUpdates(updates);
      } catch (error) {
        console.error('[WA] Failed to handle message update:', error.message);
      }
    });

    currentSocket.ev.on('connection.update', async (update) => {
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
        if (currentSocket !== this.sock) {
          return;
        }

        this.ready = false;
        this.isInitializing = false;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const disconnectReason = this.describeDisconnectReason(statusCode);
        const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
        const isRestartRequired = statusCode === DisconnectReason.restartRequired;
        this.lastStatus = `Disconnected: ${disconnectReason}`;
        console.error('[WA] Disconnected event:', disconnectReason);

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

        if (isRestartRequired) {
          this.scheduleReinitialize('restart_required', 0);
          return;
        }

        this.scheduleReinitialize('disconnected');
      }
    });
  }

  describeDisconnectReason(statusCode) {
    if (statusCode === DisconnectReason.restartRequired) return 'restart_required (515)';
    if (statusCode === DisconnectReason.connectionLost) return 'connection_lost (408)';
    if (statusCode === DisconnectReason.connectionClosed) return 'connection_closed (428)';
    if (statusCode === DisconnectReason.connectionReplaced) return 'connection_replaced (440)';
    if (statusCode === DisconnectReason.loggedOut) return 'logged_out (401)';
    if (statusCode === DisconnectReason.badSession) return 'bad_session (500)';
    if (statusCode === DisconnectReason.multideviceMismatch) return 'multidevice_mismatch (411)';
    if (statusCode === DisconnectReason.forbidden) return 'forbidden (403)';
    if (statusCode === DisconnectReason.unavailableService) return 'unavailable_service (503)';
    return statusCode ? `unknown (${statusCode})` : 'unknown';
  }

  scheduleReinitialize(trigger, delayOverrideMs) {
    if (this.reconnectTimer) return;

    this.reconnectAttempts += 1;
    const reconnectDelayMs = typeof delayOverrideMs === 'number'
      ? delayOverrideMs
      : Math.min(4000 * (2 ** (this.reconnectAttempts - 1)), 60000);

    this.lastStatus = `Reconnecting after ${trigger} in ${Math.round(reconnectDelayMs / 1000)}s...`;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      const socketToClose = this.sock;
      this.sock = null;
      this.isInitializing = false;

      try {
        if (socketToClose) {
          socketToClose.end(new Error('reconnect'));
        }
      } catch (error) {
        console.error('[WA] End socket error:', error.message);
      }

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

      if (text.trim() === '.vv') {
        await this.handleViewOnceCommand(chatId, message, content);
        continue;
      }

      const matched = customCommandStore.matchCommand(text);
      if (!matched) continue;

      await this.replyWithCustomCommand(chatId, matched, message);
    }
  }

  async handleViewOnceCommand(chatId, message, content) {
    const quoted = content?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedImage = quoted?.imageMessage;
    const quotedVideo = quoted?.videoMessage;

    try {
      if (quotedImage && quotedImage.viewOnce) {
        const stream = await downloadContentFromMessage(quotedImage, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        await this.sock.sendMessage(
          chatId,
          { image: buffer, fileName: 'media.jpg', caption: quotedImage.caption || '' },
          { quoted: message }
        );
      } else if (quotedVideo && quotedVideo.viewOnce) {
        const stream = await downloadContentFromMessage(quotedVideo, 'video');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        await this.sock.sendMessage(
          chatId,
          { video: buffer, fileName: 'media.mp4', caption: quotedVideo.caption || '' },
          { quoted: message }
        );
      } else {
        await this.sock.sendMessage(
          chatId,
          { text: 'Balas (reply) mesej gambar/video "Lihat Sekali" dengan .vv untuk buka semula.' },
          { quoted: message }
        );
      }
    } catch (error) {
      console.error('[WA] Failed to process .vv command:', error.message);
      await this.sock.sendMessage(
        chatId,
        { text: 'Gagal membuka semula media tersebut.' },
        { quoted: message }
      );
    }
  }

  async handleMessageUpdates(updates) {
    if (!this.sock || !Array.isArray(updates)) return;

    for (const item of updates) {
      const isRevoked =
        item?.update?.messageStubType === baileys.WAMessageStubType?.REVOKE ||
        (item?.update && 'message' in item.update && item.update.message === null);

      if (!isRevoked) continue;

      const chatId = item.key?.remoteJid;
      const messageId = item.key?.id;
      if (!chatId || !messageId) continue;

      await this.saveDeletedMessage(chatId, messageId, item.key);
    }
  }

  async saveDeletedMessage(chatId, messageId, key) {
    try {
      const original = await this.store?.loadMessage?.(chatId, messageId);
      if (!original?.message) return;

      const content = normalizeMessageContent(original.message) || original.message;
      const senderId = key?.participant || (chatId.endsWith('@g.us') ? '' : chatId);
      const senderName = original.pushName || '';
      const isGroup = chatId.endsWith('@g.us');

      let chatName = '';
      if (isGroup) {
        const chat = this.store?.chats?.get?.(chatId);
        chatName = chat?.name || chat?.subject || '';
      }

      const record = {
        chatId,
        chatName,
        senderId,
        senderName,
        isGroup,
        originalTimestamp: original.messageTimestamp
          ? Number(original.messageTimestamp) * 1000
          : null,
      };

      const text =
        content.conversation ||
        content.extendedTextMessage?.text ||
        content.imageMessage?.caption ||
        content.videoMessage?.caption ||
        content.documentMessage?.caption ||
        '';

      const mediaField = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage']
        .find((key2) => content[key2]);

      if (mediaField) {
        const mediaTypeMap = {
          imageMessage: 'image',
          videoMessage: 'video',
          audioMessage: 'audio',
          documentMessage: 'document',
          stickerMessage: 'sticker',
        };
        const mediaType = mediaTypeMap[mediaField];
        const mediaMessage = content[mediaField];

        try {
          const downloadType = mediaType === 'sticker' ? 'sticker' : mediaType;
          const stream = await downloadContentFromMessage(mediaMessage, downloadType);
          let buffer = Buffer.from([]);
          for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

          const extMap = {
            image: '.jpg',
            video: '.mp4',
            audio: '.ogg',
            document: '',
            sticker: '.webp',
          };
          const ext = extMap[mediaType] || '';
          const fileName = `deleted-${Date.now()}${ext}`;
          fs.mkdirSync(uploadDir, { recursive: true });
          fs.writeFileSync(path.join(uploadDir, fileName), buffer);

          record.type = mediaType;
          record.mediaUrl = `/uploads/${fileName}`;
          record.fileName = mediaMessage.fileName || fileName;
          record.text = text;
        } catch (downloadError) {
          console.error('[WA] Failed to download deleted media:', downloadError.message);
          record.type = mediaType;
          record.text = text || '[Media could not be recovered]';
        }
      } else {
        record.type = 'text';
        record.text = text || '[Unsupported message type]';
      }

      deletedMessageStore.addRecord(record);
      console.log(`[WA] Saved deleted message from ${chatId}`);
    } catch (error) {
      console.error('[WA] Failed to save deleted message:', error.message);
    }
  }

  async replyWithCustomCommand(chatId, command, quotedMessage) {
    const caption = String(command.response || '').replace(/\\n/g, '\n');
    const options = { quoted: quotedMessage };
    const hasButtons = Boolean(command.buttons && command.buttons.length);

    if (command.mediaUrl && command.mediaType) {
      const media = {
        type: command.mediaType,
        source: { url: command.mediaUrl },
        fileName: command.fileName || 'file',
      };

      if (hasButtons) {
        await sendInteractiveButtons(this.sock, chatId, { caption, media, buttons: command.buttons }, options);
        return;
      }

      const payload = { [command.mediaType]: media.source, caption };
      if (command.mediaType === 'audio') {
        payload.mimetype = 'audio/mpeg';
        payload.ptt = false;
      } else if (command.mediaType === 'document') {
        payload.fileName = media.fileName;
        payload.mimetype = 'application/octet-stream';
      }

      await this.sock.sendMessage(chatId, payload, options);
      return;
    }

    if (caption || hasButtons) {
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

  async listPersonalChats() {
    if (!this.sock || !this.ready) {
      throw new Error('WhatsApp client is not ready');
    }

    const chats = this.store?.chats?.all?.() || [];
    return chats
      .filter((chat) => {
        const jid = String(chat?.id || '');
        if (!jid.endsWith('@s.whatsapp.net')) return false;
        if (jid.includes('-')) return false;
        return true;
      })
      .map((chat) => {
        const jid = String(chat.id || '');
        const phone = this.normalizePersonalNumber(jid);
        return {
          id: jid,
          name: String(chat.name || chat.notify || chat.pushName || phone || 'Unnamed'),
          phone,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }
}

module.exports = new WhatsAppService();
