const form = document.getElementById('schedule-form');
const feedback = document.getElementById('form-feedback');
const targetTypeInput = document.getElementById('targetType');
const targetValueLabel = document.getElementById('targetValueLabel');
const targetHint = document.getElementById('targetHint');
const groupTools = document.getElementById('groupTools');
const groupPicker = document.getElementById('groupPicker');
const groupFetchHint = document.getElementById('groupFetchHint');
const refreshGroupsBtn = document.getElementById('refreshGroupsBtn');
const waStatus = document.getElementById('wa-status');
const waQrWrap = document.getElementById('wa-qr-wrap');
const waQrEmpty = document.getElementById('wa-qr-empty');
const waQrCaption = document.getElementById('wa-qr-caption');
const waQrImage = waQrWrap ? waQrWrap.querySelector('img.qr') : null;
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebarMenuBtn = document.getElementById('sidebarMenuBtn');
const navItems = Array.from(document.querySelectorAll('.sidebar-nav .nav-item'));

let hasLoadedGroups = false;

function openSidebar() {
  if (!sidebar || !sidebarOverlay) return;
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('active');
}

function closeSidebar() {
  if (!sidebar || !sidebarOverlay) return;
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('active');
}

function setActiveNavItemByHash(hash) {
  if (!navItems.length) return;
  navItems.forEach((item) => {
    const href = item.getAttribute('href') || '';
    item.classList.toggle('active', href === hash);
  });
}

function formatLocalDateTime(isoString) {
  const parsed = new Date(String(isoString || ''));
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(parsed);
}

function hydrateScheduleTimesToLocal() {
  document.querySelectorAll('.js-local-datetime').forEach((cell) => {
    const iso = cell.getAttribute('data-iso');
    const localText = formatLocalDateTime(iso);
    if (!localText) return;

    cell.textContent = localText;
    cell.title = String(iso || '');
  });
}

function renderWhatsAppState(state) {
  if (!state || !waStatus) return;

  const isReady = Boolean(state.ready);
  const statusText = String(state.status || (isReady ? 'WhatsApp connected' : 'Initializing...'));
  const qrCodeDataUrl = typeof state.qrCodeDataUrl === 'string' ? state.qrCodeDataUrl : '';

  waStatus.textContent = statusText;
  waStatus.classList.remove('status-ok', 'status-warn');
  waStatus.classList.add(isReady ? 'status-ok' : 'status-warn');

  if (waQrWrap && waQrImage && waQrEmpty) {
    if (qrCodeDataUrl) {
      waQrImage.src = qrCodeDataUrl;
      waQrWrap.hidden = false;
      waQrEmpty.hidden = true;
      if (waQrCaption) {
        waQrCaption.textContent = 'Scan this QR code from WhatsApp to connect the bot.';
      }
    } else {
      waQrImage.removeAttribute('src');
      waQrWrap.hidden = true;
      waQrEmpty.hidden = false;
      if (waQrCaption) {
        waQrCaption.textContent = '';
      }
    }
  }
}

async function refreshWhatsAppState() {
  if (!waStatus) return;

  try {
    const response = await fetch('/api/whatsapp/state');
    if (!response.ok) {
      throw new Error('Failed to fetch WhatsApp state');
    }

    const state = await response.json();
    renderWhatsAppState(state);
  } catch (error) {
    waStatus.textContent = 'Unable to refresh WhatsApp status';
    waStatus.classList.remove('status-ok');
    waStatus.classList.add('status-warn');
  }
}

function setGroupHint(text, color = '#5d645d') {
  if (!groupFetchHint) return;
  groupFetchHint.textContent = text;
  groupFetchHint.style.color = color;
}

function setGroupPickerOptions(groups) {
  if (!groupPicker) return;

  const baseOption = '<option value="">Select a group...</option>';
  const optionHtml = groups
    .map((group) => {
      const safeId = String(group.id || '').replace(/"/g, '&quot;');
      const safeName = String(group.name || 'Untitled');
      return `<option value="${safeId}">${safeName}</option>`;
    })
    .join('');

  groupPicker.innerHTML = baseOption + optionHtml;
}

async function loadGroups(force = false) {
  if (!groupPicker) return;
  if (hasLoadedGroups && !force) return;

  groupPicker.disabled = true;
  if (refreshGroupsBtn) refreshGroupsBtn.disabled = true;
  setGroupHint('Fetching group list...', '#5d645d');

  try {
    const response = await fetch('/api/whatsapp/groups');
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch group list');
    }

    const groups = Array.isArray(data.groups) ? data.groups : [];
    setGroupPickerOptions(groups);
    hasLoadedGroups = true;

    if (groups.length) {
      setGroupHint('Select a group to auto-fill the ID.', '#5d645d');
    } else {
      setGroupHint('No groups found on this account.', '#9f4f03');
    }
  } catch (error) {
    setGroupPickerOptions([]);
    setGroupHint(error.message, '#b42318');
  } finally {
    groupPicker.disabled = false;
    if (refreshGroupsBtn) refreshGroupsBtn.disabled = false;
  }
}

function syncTargetInputContent() {
  if (!targetTypeInput || !targetValueLabel || !targetHint) return;

  if (targetTypeInput.value === 'group') {
    targetValueLabel.textContent = 'Group ID (example: 1203630xxxx@g.us)';
    targetHint.textContent = 'You can enter 1203630xxxx only or with @g.us suffix';
    if (groupTools) groupTools.hidden = false;
    loadGroups();
    return;
  }

  targetValueLabel.textContent = 'Destination Number (62812xxxx)';
  targetHint.textContent = 'Personal example: 6281234567890';
  if (groupTools) groupTools.hidden = true;
}

if (targetTypeInput) {
  targetTypeInput.addEventListener('change', syncTargetInputContent);
  syncTargetInputContent();
}

if (sidebarMenuBtn) {
  sidebarMenuBtn.addEventListener('click', openSidebar);
}

if (sidebarOverlay) {
  sidebarOverlay.addEventListener('click', closeSidebar);
}

if (navItems.length) {
  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const hash = item.getAttribute('href') || '';
      setActiveNavItemByHash(hash);
      closeSidebar();
    });
  });

  setActiveNavItemByHash(window.location.hash || '#status');
  window.addEventListener('hashchange', () => {
    setActiveNavItemByHash(window.location.hash || '#status');
  });
}

if (groupPicker) {
  groupPicker.addEventListener('change', () => {
    const selected = String(groupPicker.value || '').trim();
    const targetValueInput = document.getElementById('targetValue');
    if (!targetValueInput || !selected) return;
    targetValueInput.value = selected;
  });
}

if (refreshGroupsBtn) {
  refreshGroupsBtn.addEventListener('click', () => {
    loadGroups(true);
  });
}

if (waStatus) {
  refreshWhatsAppState();
  window.setInterval(refreshWhatsAppState, 5000);
}

hydrateScheduleTimesToLocal();

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = {
      targetType: String(formData.get('targetType') || '').trim(),
      targetValue: String(formData.get('targetValue') || '').trim(),
      message: String(formData.get('message') || '').trim(),
      scheduleAt: String(formData.get('scheduleAt') || '').trim(),
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    };

    feedback.textContent = 'Saving schedule...';
    feedback.style.color = '#5d645d';

    try {
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create schedule');
      }

      feedback.textContent = 'Schedule saved successfully';
      feedback.style.color = '#136f63';
      form.reset();
      syncTargetInputContent();
      setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      feedback.textContent = error.message;
      feedback.style.color = '#b42318';
    }
  });
}

document.querySelectorAll('.btn-delete').forEach((button) => {
  button.addEventListener('click', async () => {
    const id = button.dataset.id;
    if (!id) return;

    const confirmDelete = window.confirm('Delete this schedule?');
    if (!confirmDelete) return;

    try {
      const response = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete schedule');
      }
      window.location.reload();
    } catch (error) {
      window.alert(error.message);
    }
  });
});
