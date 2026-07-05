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
const methodTabQr = document.getElementById('methodTabQr');
const methodTabPhone = document.getElementById('methodTabPhone');
const qrMethodPanel = document.getElementById('qr-method');
const phoneMethodPanel = document.getElementById('phone-method');
const pairingPhoneInput = document.getElementById('pairingPhone');
const requestPairingBtn = document.getElementById('requestPairingBtn');
const pairingFeedback = document.getElementById('pairing-feedback');
const pairingCodeWrap = document.getElementById('pairing-code-wrap');
const pairingCodeValue = document.getElementById('pairing-code-value');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebarMenuBtn = document.getElementById('sidebarMenuBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const navItems = Array.from(document.querySelectorAll('.sidebar-nav .nav-item'));
const pages = Array.from(document.querySelectorAll('.page[data-page]'));
const DEFAULT_PAGE_HASH = '#account';
const THEME_STORAGE_KEY = 'schedulebot-theme';

let hasLoadedGroups = false;

function applyTheme(theme) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', normalized);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, normalized);
  } catch (error) {
    /* ignore storage errors */
  }
}

function initTheme() {
  let storedTheme = null;
  try {
    storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    storedTheme = null;
  }
  applyTheme(storedTheme === 'light' ? 'light' : 'dark');
}

initTheme();

if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
  });
}

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

function showPageByHash(hash) {
  if (!pages.length) return;

  const normalizedHash = String(hash || '').replace('#', '') || DEFAULT_PAGE_HASH.replace('#', '');
  const targetPage = pages.find((page) => page.getAttribute('data-page') === normalizedHash);
  const fallbackPage = pages.find((page) => page.getAttribute('data-page') === DEFAULT_PAGE_HASH.replace('#', ''));
  const pageToShow = targetPage || fallbackPage || pages[0];

  pages.forEach((page) => {
    page.hidden = page !== pageToShow;
  });

  setActiveNavItemByHash(`#${pageToShow.getAttribute('data-page')}`);
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

  const pairingCode = typeof state.pairingCode === 'string' ? state.pairingCode : '';
  if (pairingCodeWrap && pairingCodeValue) {
    if (pairingCode) {
      pairingCodeValue.textContent = pairingCode;
      pairingCodeWrap.hidden = false;
    } else {
      pairingCodeValue.textContent = '';
      pairingCodeWrap.hidden = true;
    }
  }

  if (isReady) {
    setActiveConnectionMethod('qr');
  }
}

function setActiveConnectionMethod(method) {
  if (!methodTabQr || !methodTabPhone || !qrMethodPanel || !phoneMethodPanel) return;

  const isPhone = method === 'phone';
  methodTabQr.classList.toggle('active', !isPhone);
  methodTabPhone.classList.toggle('active', isPhone);
  qrMethodPanel.hidden = isPhone;
  phoneMethodPanel.hidden = !isPhone;
}

if (methodTabQr) {
  methodTabQr.addEventListener('click', () => setActiveConnectionMethod('qr'));
}

if (methodTabPhone) {
  methodTabPhone.addEventListener('click', () => setActiveConnectionMethod('phone'));
}

if (requestPairingBtn) {
  requestPairingBtn.addEventListener('click', async () => {
    const phoneNumber = pairingPhoneInput ? pairingPhoneInput.value.trim() : '';
    if (!phoneNumber) {
      if (pairingFeedback) {
        pairingFeedback.textContent = 'Please enter a phone number';
        pairingFeedback.style.color = '#b42318';
      }
      return;
    }

    requestPairingBtn.disabled = true;
    if (pairingFeedback) {
      pairingFeedback.textContent = 'Requesting pairing code...';
      pairingFeedback.style.color = '#5d645d';
    }
    if (pairingCodeWrap) pairingCodeWrap.hidden = true;

    try {
      const response = await fetch('/api/whatsapp/pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to request pairing code');
      }

      if (pairingCodeValue && pairingCodeWrap) {
        pairingCodeValue.textContent = data.code || '';
        pairingCodeWrap.hidden = false;
      }
      if (pairingFeedback) {
        pairingFeedback.textContent = 'Pairing code generated, enter it in WhatsApp.';
        pairingFeedback.style.color = '#136f63';
      }
    } catch (error) {
      if (pairingFeedback) {
        pairingFeedback.textContent = error.message;
        pairingFeedback.style.color = '#b42318';
      }
    } finally {
      requestPairingBtn.disabled = false;
    }
  });
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
    item.addEventListener('click', (event) => {
      event.preventDefault();
      const hash = item.getAttribute('href') || '';
      window.history.pushState(null, '', hash);
      showPageByHash(hash);
      closeSidebar();
    });
  });

  showPageByHash(window.location.hash || DEFAULT_PAGE_HASH);
  window.addEventListener('hashchange', () => {
    showPageByHash(window.location.hash || DEFAULT_PAGE_HASH);
  });
  window.addEventListener('popstate', () => {
    showPageByHash(window.location.hash || DEFAULT_PAGE_HASH);
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

/* ---------- Custom Commands ---------- */

const commandForm = document.getElementById('command-form');
const commandFeedback = document.getElementById('command-feedback');
const commandTriggerInput = document.getElementById('commandTrigger');
const commandOriginalTrigger = document.getElementById('commandOriginalTrigger');
const commandSubmitBtn = document.getElementById('commandSubmitBtn');
const commandCancelBtn = document.getElementById('commandCancelBtn');
const addButtonRowBtn = document.getElementById('addButtonRowBtn');
const buttonRows = document.getElementById('buttonRows');

const commandsByTrigger = new Map(
  (Array.isArray(window.__CUSTOM_COMMANDS__) ? window.__CUSTOM_COMMANDS__ : []).map((item) => [
    item.trigger,
    item,
  ])
);

function buttonRowTemplate(button = {}) {
  const row = document.createElement('div');
  row.className = 'button-row';

  let params = {};
  if (typeof button.buttonParamsJson === 'string') {
    try {
      params = JSON.parse(button.buttonParamsJson);
    } catch (error) {
      params = {};
    }
  }

  const name = button.name || 'quick_reply';

  row.innerHTML = `
    <select class="btn-type-select">
      <option value="quick_reply">Quick Reply</option>
      <option value="cta_url">Open Link</option>
      <option value="cta_call">Call</option>
    </select>
    <input class="btn-label-input" placeholder="Button label" />
    <input class="btn-value-input" placeholder="Value (id / URL / phone)" />
    <button type="button" class="btn btn-ghost btn-sm btn-remove-row" aria-label="Remove button">&times;</button>
  `;

  const typeSelect = row.querySelector('.btn-type-select');
  const labelInput = row.querySelector('.btn-label-input');
  const valueInput = row.querySelector('.btn-value-input');
  const removeBtn = row.querySelector('.btn-remove-row');

  typeSelect.value = name;
  labelInput.value = params.display_text || '';
  valueInput.value = params.id || params.url || params.phone_number || '';

  function syncPlaceholder() {
    if (typeSelect.value === 'cta_url') {
      valueInput.placeholder = 'https://example.com';
    } else if (typeSelect.value === 'cta_call') {
      valueInput.placeholder = '+60123456789';
    } else {
      valueInput.placeholder = 'reply_id';
    }
  }
  syncPlaceholder();
  typeSelect.addEventListener('change', syncPlaceholder);

  removeBtn.addEventListener('click', () => row.remove());

  return row;
}

function addButtonRow(button) {
  if (!buttonRows) return;
  buttonRows.appendChild(buttonRowTemplate(button));
}

function clearButtonRows() {
  if (buttonRows) buttonRows.innerHTML = '';
}

function collectButtonsFromRows() {
  if (!buttonRows) return [];

  return Array.from(buttonRows.querySelectorAll('.button-row'))
    .map((row) => {
      const type = row.querySelector('.btn-type-select').value;
      const label = row.querySelector('.btn-label-input').value.trim();
      const value = row.querySelector('.btn-value-input').value.trim();
      if (!label || !value) return null;

      let params = { display_text: label };
      if (type === 'cta_url') params.url = value;
      else if (type === 'cta_call') params.phone_number = value;
      else params.id = value;

      return { name: type, buttonParamsJson: JSON.stringify(params) };
    })
    .filter(Boolean);
}

if (addButtonRowBtn) {
  addButtonRowBtn.addEventListener('click', () => addButtonRow());
}

function setCommandFeedback(message, color) {
  if (!commandFeedback) return;
  commandFeedback.textContent = message;
  commandFeedback.style.color = color || '#5d645d';
}

function resetCommandForm() {
  if (!commandForm) return;
  commandForm.reset();
  clearButtonRows();
  if (commandOriginalTrigger) commandOriginalTrigger.value = '';
  if (commandTriggerInput) commandTriggerInput.disabled = false;
  if (commandSubmitBtn) commandSubmitBtn.textContent = 'Save Command';
  if (commandCancelBtn) commandCancelBtn.hidden = true;
}

function fillCommandForm(command) {
  if (!commandForm || !command) return;

  commandForm.querySelector('#commandTrigger').value = command.trigger || '';
  commandForm.querySelector('#commandCategory').value = command.category || 'General';
  commandForm.querySelector('#commandDescription').value = command.description || '';
  commandForm.querySelector('#commandResponse').value = command.response || '';
  commandForm.querySelector('#commandMediaType').value = command.mediaType || '';
  commandForm.querySelector('#commandMediaUrl').value = command.mediaUrl || '';
  commandForm.querySelector('#commandFileName').value = command.fileName || '';

  clearButtonRows();
  (command.buttons || []).forEach((button) => addButtonRow(button));

  if (commandOriginalTrigger) commandOriginalTrigger.value = command.trigger || '';
  if (commandTriggerInput) commandTriggerInput.disabled = true;
  if (commandSubmitBtn) commandSubmitBtn.textContent = 'Update Command';
  if (commandCancelBtn) commandCancelBtn.hidden = false;

  window.history.pushState(null, '', '#custom-commands');
  showPageByHash('#custom-commands');
  commandForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

if (commandCancelBtn) {
  commandCancelBtn.addEventListener('click', resetCommandForm);
}

if (commandForm) {
  commandForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(commandForm);
    const originalTrigger = commandOriginalTrigger ? commandOriginalTrigger.value : '';
    const isEditing = Boolean(originalTrigger);

    const payload = {
      trigger: String(formData.get('trigger') || '').trim(),
      category: String(formData.get('category') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      response: String(formData.get('response') || '').trim(),
      mediaType: String(formData.get('mediaType') || '').trim(),
      mediaUrl: String(formData.get('mediaUrl') || '').trim(),
      fileName: String(formData.get('fileName') || '').trim(),
      buttons: collectButtonsFromRows(),
    };

    setCommandFeedback(isEditing ? 'Updating command...' : 'Saving command...', '#5d645d');

    try {
      const url = isEditing
        ? `/api/custom-commands/${encodeURIComponent(originalTrigger)}`
        : '/api/custom-commands';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save command');
      }

      setCommandFeedback(isEditing ? 'Command updated' : 'Command saved', '#136f63');
      setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      setCommandFeedback(error.message, '#b42318');
    }
  });
}

document.querySelectorAll('.btn-edit-command').forEach((button) => {
  button.addEventListener('click', () => {
    const trigger = button.dataset.trigger;
    const command = commandsByTrigger.get(trigger);
    if (command) fillCommandForm(command);
  });
});

document.querySelectorAll('.btn-delete-command').forEach((button) => {
  button.addEventListener('click', async () => {
    const trigger = button.dataset.trigger;
    if (!trigger) return;

    const confirmDelete = window.confirm(`Delete command ${trigger}?`);
    if (!confirmDelete) return;

    try {
      const response = await fetch(`/api/custom-commands/${encodeURIComponent(trigger)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete command');
      }
      window.location.reload();
    } catch (error) {
      window.alert(error.message);
    }
  });
});
