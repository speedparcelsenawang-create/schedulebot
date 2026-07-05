const dayjs = require('dayjs');

const schedules = [];
let idCounter = 1;

function createSchedule({ targetType, targetValue, message, scheduleAt }) {
  const newItem = {
    id: idCounter++,
    targetType,
    targetValue,
    message,
    scheduleAt,
    status: 'pending',
    createdAt: new Date().toISOString(),
    sentAt: null,
    error: null,
  };

  schedules.push(newItem);
  return newItem;
}

function listSchedules() {
  return [...schedules].sort((a, b) => {
    const aTime = dayjs(a.scheduleAt).valueOf();
    const bTime = dayjs(b.scheduleAt).valueOf();
    return aTime - bTime;
  });
}

function getPendingSchedules(now = new Date()) {
  const nowMs = dayjs(now).valueOf();
  return schedules.filter((item) => {
    if (item.status !== 'pending') return false;
    return dayjs(item.scheduleAt).valueOf() <= nowMs;
  });
}

function markSent(id) {
  const target = schedules.find((item) => item.id === id);
  if (!target) return null;

  target.status = 'sent';
  target.sentAt = new Date().toISOString();
  target.error = null;
  return target;
}

function markFailed(id, errorMessage) {
  const target = schedules.find((item) => item.id === id);
  if (!target) return null;

  target.status = 'failed';
  target.error = errorMessage;
  return target;
}

function removeSchedule(id) {
  const index = schedules.findIndex((item) => item.id === id);
  if (index === -1) return false;

  schedules.splice(index, 1);
  return true;
}

module.exports = {
  createSchedule,
  listSchedules,
  getPendingSchedules,
  markSent,
  markFailed,
  removeSchedule,
};
