const baileys = require('atexovi-baileys');

const { generateWAMessageFromContent, proto } = baileys;

function isPersonalJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@s.whatsapp.net');
}

function getButtonDedupKey(button) {
  if (!button || typeof button !== 'object') return '';

  const name = String(button.name || '').trim();
  let params = {};

  if (typeof button.buttonParamsJson === 'string') {
    try {
      params = JSON.parse(button.buttonParamsJson);
    } catch (error) {
      params = {};
    }
  }

  if (name === 'quick_reply') {
    return `quick_reply:${String(params.id || '').trim()}:${String(params.display_text || '').trim()}`;
  }
  if (name === 'cta_url') {
    return `cta_url:${String(params.url || '').trim()}:${String(params.display_text || '').trim()}`;
  }
  if (name === 'cta_call') {
    return `cta_call:${String(params.phone_number || '').trim()}:${String(params.display_text || '').trim()}`;
  }
  if (name === 'cta_copy') {
    return `cta_copy:${String(params.copy_code || '').trim()}:${String(params.display_text || '').trim()}`;
  }

  return `${name}:${JSON.stringify(params)}`;
}

function toNativeFlowButtons(buttons) {
  if (!Array.isArray(buttons)) return [];

  const mapped = [];
  const seen = new Set();

  for (const button of buttons) {
    if (!button || typeof button !== 'object' || !button.name || !button.buttonParamsJson) continue;

    const normalized = {
      name: String(button.name),
      buttonParamsJson:
        typeof button.buttonParamsJson === 'string'
          ? button.buttonParamsJson
          : JSON.stringify(button.buttonParamsJson),
    };

    const key = getButtonDedupKey(normalized);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    mapped.push(normalized);
  }

  return mapped;
}

function toLegacyButtons(nativeButtons) {
  return nativeButtons
    .map((button, index) => {
      try {
        const params = JSON.parse(button.buttonParamsJson || '{}');
        const displayText = params.display_text || `Button ${index + 1}`;
        const buttonId = params.id || params.url || params.phone_number || params.copy_code || displayText;
        return { buttonId: String(buttonId), buttonText: { displayText }, type: 1 };
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean)
    .slice(0, 3);
}

async function sendInteractiveButtons(sock, jid, payload, options = {}) {
  const bodyText = payload?.text || payload?.caption || '';
  const footerText = payload?.footer || '';
  const nativeButtons = toNativeFlowButtons(payload?.buttons);
  const shouldStripQuotedFallback = isPersonalJid(jid) && Boolean(options?.quoted);

  if (!nativeButtons.length) {
    await sock.sendMessage(jid, { text: bodyText || ' ' }, options);
    return;
  }

  try {
    await sock.sendMessage(
      jid,
      {
        text: bodyText || ' ',
        footer: footerText,
        interactiveButtons: nativeButtons,
        viewOnce: true,
      },
      options
    );
    return;
  } catch (error) {
    // Fallback for Baileys variants that do not support interactiveButtons in sendMessage.
    console.warn('[WA] interactiveButtons via sendMessage failed:', error.message);

    if (shouldStripQuotedFallback) {
      try {
        await sock.sendMessage(jid, {
          text: bodyText || ' ',
          footer: footerText,
          interactiveButtons: nativeButtons,
          viewOnce: true,
        });
        return;
      } catch (retryError) {
        console.warn('[WA] interactiveButtons retry without quoted failed:', retryError.message);
      }
    }
  }

  try {
    const msg = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            interactiveMessage: proto.Message.InteractiveMessage.create({
              body: proto.Message.InteractiveMessage.Body.create({ text: bodyText || ' ' }),
              footer: proto.Message.InteractiveMessage.Footer.create({ text: footerText }),
              header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
              nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                buttons: nativeButtons,
              }),
            }),
          },
        },
      },
      {
        userJid: sock?.user?.id,
        quoted: options?.quoted,
      }
    );

    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
  } catch (error) {
    console.warn('[WA] nativeFlow relay failed, trying legacy buttons:', error.message);
    const legacyButtons = toLegacyButtons(nativeButtons);
    if (!legacyButtons.length) throw error;

    try {
      await sock.sendMessage(
        jid,
        {
          text: bodyText || ' ',
          footer: footerText,
          buttons: legacyButtons,
          headerType: 1,
          viewOnce: true,
        },
        options
      );
    } catch (legacyError) {
      if (!shouldStripQuotedFallback) throw legacyError;

      await sock.sendMessage(jid, {
        text: bodyText || ' ',
        footer: footerText,
        buttons: legacyButtons,
        headerType: 1,
        viewOnce: true,
      });
    }
  }
}

module.exports = {
  sendInteractiveButtons,
  toNativeFlowButtons,
};
