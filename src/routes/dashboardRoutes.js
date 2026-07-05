const express = require('express');
const dayjs = require('dayjs');
const scheduleStore = require('../services/scheduleStore');
const customCommandStore = require('../services/customCommandStore');

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

  router.get('/', (req, res) => {
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

    res.render('dashboard', {
      schedules,
      waState,
      scheduleStats,
      dayjs,
      customCommands,
      commandCategories: customCommandStore.ALLOWED_CATEGORIES,
      mediaTypes: customCommandStore.ALLOWED_MEDIA_TYPES,
    });
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

    if (!['personal', 'group'].includes(targetType)) {
      return res.status(400).json({ error: 'targetType must be personal or group' });
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
