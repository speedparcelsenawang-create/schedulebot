const express = require('express');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const multer = require('multer');
const scheduleStore = require('../services/scheduleStore');
const customCommandStore = require('../services/customCommandStore');

const uploadDir = path.join(process.cwd(), 'uploads');
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const baseName = path
      .basename(file.originalname || 'media', ext)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-');
    cb(null, `${Date.now()}-${baseName || 'media'}${ext}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

function parseClientLocalDateTime(scheduleAt, timezoneOffsetMinutes) {
  const raw = String(scheduleAt || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const offset = Number.isFinite(Number(timezoneOffsetMinutes))
    ? Number(timezoneOffsetMinutes)
    : 0;

  const utcMs = Date.UTC(year, month - 1, day, hour, minute) + (offset * 60 * 1000);
  const parsed = dayjs(utcMs);

  if (!parsed.isValid()) return null;
  return parsed;
}

function createDashboardRouter(whatsappService) {
  const router = express.Router();

  function getDashboardViewData() {
    const schedules = scheduleStore.listSchedules();
    const waState = whatsappService.getConnectionState();
    const scheduleStats = schedules.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === 'pending') acc.pending += 1;
        if (item.status === 'sent') acc.sent += 1;
        if (item.status === 'failed') acc.failed += 1;
        return acc;
      },
      { total: 0, pending: 0, sent: 0, failed: 0 }
    );

    const customCommands = customCommandStore.listCommands();

    return {
      schedules,
      waState,
      scheduleStats,
      dayjs,
      customCommands,
      commandCategories: customCommandStore.ALLOWED_CATEGORIES,
      mediaTypes: customCommandStore.ALLOWED_MEDIA_TYPES,
    };
  }

  router.get('/', (req, res) => {
    res.render('dashboard', getDashboardViewData());
  });

  router.get('/api/custom-commands', (req, res) => {
    return res.json({ commands: customCommandStore.listCommands() });
  });

  router.post('/api/custom-commands', (req, res) => {
    try {
      const created = customCommandStore.createCommand(req.body || {});
      return res.status(201).json(created);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  router.post('/api/custom-commands/upload-media', upload.single('mediaFile'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const mediaType = String(req.body?.mediaType || '').trim();
      const allowedMedia = new Set(customCommandStore.ALLOWED_MEDIA_TYPES);
      if (!allowedMedia.has(mediaType)) {
        return res.status(400).json({ error: 'Invalid media type for upload' });
      }

      const host = req.get('host');
      const protocol = req.protocol || 'http';
      const mediaUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

      return res.status(201).json({
        mediaUrl,
        fileName: req.file.originalname || req.file.filename,
      });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to upload media file' });
    }
  });

  router.put('/api/custom-commands/:trigger', (req, res) => {
    try {
      const updated = customCommandStore.updateCommand(req.params.trigger, req.body || {});
      return res.json(updated);
    } catch (error) {
      const status = error.message === 'Command not found' ? 404 : 400;
      return res.status(status).json({ error: error.message });
    }
  });

  router.delete('/api/custom-commands/:trigger', (req, res) => {
    const removed = customCommandStore.removeCommand(req.params.trigger);
    if (!removed) {
      return res.status(404).json({ error: 'Command not found' });
    }
    return res.status(204).send();
  });

  router.post('/api/schedules', (req, res) => {
    const { targetType, targetValue, message, scheduleAt, timezoneOffsetMinutes } = req.body;

    if (!targetType || !targetValue || !message || !scheduleAt) {
      return res.status(400).json({
        error: 'targetType, targetValue, message, and scheduleAt are required',
      });
    }

    if (targetType !== 'group') {
      return res.status(400).json({ error: 'targetType must be group' });
    }

    const parsed = parseClientLocalDateTime(scheduleAt, timezoneOffsetMinutes);
    if (!parsed.isValid()) {
      return res.status(400).json({
        error: 'Invalid scheduleAt format',
      });
    }

    const created = scheduleStore.createSchedule({
      targetType,
      targetValue,
      message,
      scheduleAt: parsed.toISOString(),
    });

    return res.status(201).json(created);
  });

  router.delete('/api/schedules/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const deleted = scheduleStore.removeSchedule(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    return res.status(204).send();
  });

  router.get('/api/whatsapp/groups', async (req, res, next) => {
    try {
      const groups = await whatsappService.listGroups();
      return res.json({ groups });
    } catch (error) {
      if (error.message === 'WhatsApp client is not ready') {
        return res.status(409).json({ error: error.message });
      }
      return next(error);
    }
  });

  router.get('/api/whatsapp/state', (req, res) => {
    const waState = whatsappService.getConnectionState();
    return res.json(waState);
  });

  router.post('/api/whatsapp/pairing-code', async (req, res) => {
    try {
      const { phoneNumber } = req.body || {};
      const code = await whatsappService.requestPairingCode(phoneNumber);
      return res.json({ code });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  return router;
}

module.exports = createDashboardRouter;
