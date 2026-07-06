const form = document.getElementById('schedule-form');
const feedback = document.getElementById('form-feedback');
const targetTypeInput = document.getElementById('targetType');
const targetValueField = document.getElementById('targetValueField');
const targetValueLabel = document.getElementById('targetValueLabel');
const targetHint = document.getElementById('targetHint');
const groupTools = document.getElementById('groupTools');
const groupPicker = document.getElementById('groupPicker');
const groupFetchHint = document.getElementById('groupFetchHint');
const refreshGroupsBtn = document.getElementById('refreshGroupsBtn');
const personalChatTools = document.getElementById('personalChatTools');
const personalChatPicker = document.getElementById('personalChatPicker');
const personalChatFetchHint = document.getElementById('personalChatFetchHint');
const refreshPersonalChatsBtn = document.getElementById('refreshPersonalChatsBtn');
const waStatus = document.getElementById('wa-status');
const waConnectedWrap = document.getElementById('wa-connected-wrap');
const waQrWrap = document.getElementById('wa-qr-wrap');
const waQrEmpty = document.getElementById('wa-qr-empty');
const waQrCaption = document.getElementById('wa-qr-caption');
const waQrImage = waQrWrap ? waQrWrap.querySelector('img.qr') : null;
const methodTabQr = document.getElementById('methodTabQr');
const methodTabPhone = document.getElementById('methodTabPhone');
const qrMethodPanel = document.getElementById('qr-method');
const phoneMethodPanel = document.getElementById('phone-method');
const scheduleTabCreate = document.getElementById('scheduleTabCreate');
const scheduleTabList = document.getElementById('scheduleTabList');
const scheduleCreatePanel = document.getElementById('schedule-create-panel');
const scheduleListPanel = document.getElementById('schedule-list-panel');
const commandTabCreate = document.getElementById('commandTabCreate');
const commandTabList = document.getElementById('commandTabList');
const commandCreatePanel = document.getElementById('command-create-panel');
const commandListPanel = document.getElementById('command-list-panel');
const pairingPhoneInput = document.getElementById('pairingPhone');
const requestPairingBtn = document.getElementById('requestPairingBtn');
const pairingFeedback = document.getElementById('pairing-feedback');
const pairingCodeWrap = document.getElementById('pairing-code-wrap');
const pairingCodeValue = document.getElementById('pairing-code-value');
const accountTargetTips = document.getElementById('account-target-tips');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebarMenuBtn = document.getElementById('sidebarMenuBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const topNavTitle = document.getElementById('topNavTitle');
const breadcrumbRoot = document.getElementById('breadcrumbRoot');
const breadcrumbPage = document.getElementById('breadcrumbPage');
const breadcrumbSectionSep = document.getElementById('breadcrumbSectionSep');
const breadcrumbSection = document.getElementById('breadcrumbSection');
const navItems = Array.from(document.querySelectorAll('.sidebar-nav .nav-item'));
const pages = Array.from(document.querySelectorAll('.page[data-page]'));
const globalLoadingBar = document.getElementById('globalLoadingBar');
const DEFAULT_PAGE_HASH = '#account';
const THEME_STORAGE_KEY = 'schedulebot-theme';
const PANEL_TRANSITION_MS = 180;
const LOADING_BAR_DELAY_MS = 90;

let hasLoadedGroups = false;
let hasLoadedPersonalChats = false;
let isWhatsAppReady = false;
let networkRequestsInFlight = 0;
let loadingBarDelayTimer = null;

const PAGE_TITLE_MAP = {
  account: 'Account',
  schedule: 'Schedule',
  'custom-commands': 'Custom Command',
  'deleted-messages': 'Deleted Messages',
};

function getActivePageKey() {
  const activePage = pages.find((page) => !page.hidden);
  return activePage ? String(activePage.getAttribute('data-page') || '') : '';
}

function animatePanelEntry(panel) {
  if (!panel || panel.hidden) return;

  panel.classList.remove('is-entering');
  window.requestAnimationFrame(() => {
    panel.classList.add('is-entering');
    window.setTimeout(() => {
      panel.classList.remove('is-entering');
    }, PANEL_TRANSITION_MS);
  });
}

function setButtonBusy(button, isBusy, busyText) {
  if (!button) return;

  if (isBusy) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent || '';
    }
    if (busyText) {
      button.textContent = busyText;
    }
    button.disabled = true;
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');
    return;
  }

  if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
    delete button.dataset.originalText;
  }
  button.classList.remove('is-loading');
  button.removeAttribute('aria-busy');
}

function showGlobalLoadingBar() {
  if (!globalLoadingBar) return;
  globalLoadingBar.hidden = false;
  globalLoadingBar.classList.add('active');
}

function hideGlobalLoadingBar() {
  if (!globalLoadingBar) return;
  globalLoadingBar.classList.remove('active');
  window.setTimeout(() => {
    if (!globalLoadingBar.classList.contains('active')) {
      globalLoadingBar.hidden = true;
    }
  }, 120);
}

function trackNetworkStart() {
  networkRequestsInFlight += 1;
  if (networkRequestsInFlight !== 1) return;

  loadingBarDelayTimer = window.setTimeout(() => {
    showGlobalLoadingBar();
  }, LOADING_BAR_DELAY_MS);
}

function trackNetworkEnd() {
  networkRequestsInFlight = Math.max(0, networkRequestsInFlight - 1);
  if (networkRequestsInFlight > 0) return;

  if (loadingBarDelayTimer) {
    window.clearTimeout(loadingBarDelayTimer);
    loadingBarDelayTimer = null;
  }
  hideGlobalLoadingBar();
}

function initGlobalFetchLoadingIndicator() {
  if (typeof window.fetch !== 'function' || window.fetch.__schedulebotTracked) return;

  const nativeFetch = window.fetch.bind(window);
  const trackedFetch = async (...args) => {
    trackNetworkStart();
    try {
      return await nativeFetch(...args);
    } finally {
      trackNetworkEnd();
    }
  };

  trackedFetch.__schedulebotTracked = true;
  trackedFetch.__nativeFetch = nativeFetch;
  window.fetch = trackedFetch;
}

function finishInitialBoot() {
  window.requestAnimationFrame(() => {
    document.body.classList.remove('app-booting');
  });
}

function getActiveAccountSectionLabel() {
  if (!methodTabQr || !methodTabPhone) return '';
  return methodTabPhone.classList.contains('active') ? 'Phone Number' : 'QR Code';
}

function getActiveScheduleSectionLabel() {
  if (!scheduleTabCreate || !scheduleTabList) return '';
  return scheduleTabList.classList.contains('active') ? 'Schedule List' : 'Create Schedule';
}

function getActiveCommandSectionLabel() {
  if (!commandTabCreate || !commandTabList) return '';
  return commandTabList.classList.contains('active') ? 'Command List' : 'Add Command';
}

function updateTopBreadcrumb() {
  const activePageKey = getActivePageKey();
  const pageTitle = PAGE_TITLE_MAP[activePageKey] || 'Dashboard';

  let sectionTitle = '';
  if (activePageKey === 'account') sectionTitle = getActiveAccountSectionLabel();
  if (activePageKey === 'schedule') sectionTitle = getActiveScheduleSectionLabel();
  if (activePageKey === 'custom-commands') sectionTitle = getActiveCommandSectionLabel();

  if (topNavTitle) topNavTitle.textContent = pageTitle;
  if (breadcrumbRoot) breadcrumbRoot.textContent = 'Dashboard';
  if (breadcrumbPage) breadcrumbPage.textContent = pageTitle;
  if (breadcrumbSection) {
    breadcrumbSection.textContent = sectionTitle;
    breadcrumbSection.hidden = !sectionTitle;
  }
  if (breadcrumbSectionSep) {
    breadcrumbSectionSep.hidden = !sectionTitle;
  }
}

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
initGlobalFetchLoadingIndicator();

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

  animatePanelEntry(pageToShow);

  setActiveNavItemByHash(`#${pageToShow.getAttribute('data-page')}`);
  updateTopBreadcrumb();
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
  isWhatsAppReady = isReady;
  document.body.classList.toggle('wa-ready', isReady);
  const statusText = String(state.status || (isReady ? 'WhatsApp connected' : 'Initializing...'));
  const qrCodeDataUrl = typeof state.qrCodeDataUrl === 'string' ? state.qrCodeDataUrl : '';

  waStatus.textContent = statusText;
  waStatus.classList.remove('status-ok', 'status-warn');
  waStatus.classList.add(isReady ? 'status-ok' : 'status-warn');

  if (waConnectedWrap) {
    waConnectedWrap.hidden = !isReady;
  }

  if (methodTabPhone) {
    methodTabPhone.disabled = isReady;
  }

  if (pairingPhoneInput) {
    pairingPhoneInput.disabled = isReady;
  }

  if (requestPairingBtn) {
    requestPairingBtn.disabled = isReady;
  }

  if (pairingFeedback && isReady) {
    pairingFeedback.textContent = 'Pairing via phone number is disabled while WhatsApp is connected.';
    pairingFeedback.style.color = '#5d645d';
  }

  if (accountTargetTips) {
    accountTargetTips.hidden = isReady;
  }

  if (waQrWrap && waQrImage && waQrEmpty) {
    if (isReady) {
      waQrImage.removeAttribute('src');
      waQrWrap.hidden = true;
      waQrEmpty.hidden = true;
      if (waQrCaption) {
        waQrCaption.textContent = '';
      }
    } else if (qrCodeDataUrl) {
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
  animatePanelEntry(isPhone ? phoneMethodPanel : qrMethodPanel);
  updateTopBreadcrumb();
}

function setTabbedPanel(activeTabKey, tabs, panels) {
  const hasCreateTab = Boolean(tabs.create);
  const hasListTab = Boolean(tabs.list);
  const hasCreatePanel = Boolean(panels.create);
  const hasListPanel = Boolean(panels.list);

  if (!hasCreateTab || !hasListTab || !hasCreatePanel || !hasListPanel) return;

  const isList = activeTabKey === 'list';
  tabs.create.classList.toggle('active', !isList);
  tabs.list.classList.toggle('active', isList);
  tabs.create.setAttribute('aria-selected', String(!isList));
  tabs.list.setAttribute('aria-selected', String(isList));

  panels.create.hidden = isList;
  panels.list.hidden = !isList;
  animatePanelEntry(isList ? panels.list : panels.create);
  updateTopBreadcrumb();
}

if (methodTabQr) {
  methodTabQr.addEventListener('click', () => setActiveConnectionMethod('qr'));
}

if (methodTabPhone) {
  methodTabPhone.addEventListener('click', () => {
    if (isWhatsAppReady) return;
    setActiveConnectionMethod('phone');
  });
}

if (scheduleTabCreate) {
  scheduleTabCreate.addEventListener('click', () => {
    setTabbedPanel(
      'create',
      { create: scheduleTabCreate, list: scheduleTabList },
      { create: scheduleCreatePanel, list: scheduleListPanel }
    );
  });
}

if (scheduleTabList) {
  scheduleTabList.addEventListener('click', () => {
    setTabbedPanel(
      'list',
      { create: scheduleTabCreate, list: scheduleTabList },
      { create: scheduleCreatePanel, list: scheduleListPanel }
    );
  });
}

if (commandTabCreate) {
  commandTabCreate.addEventListener('click', () => {
    setTabbedPanel(
      'create',
      { create: commandTabCreate, list: commandTabList },
      { create: commandCreatePanel, list: commandListPanel }
    );
  });
}

if (commandTabList) {
  commandTabList.addEventListener('click', () => {
    setTabbedPanel(
      'list',
      { create: commandTabCreate, list: commandTabList },
      { create: commandCreatePanel, list: commandListPanel }
    );
  });
}

setTabbedPanel(
  'create',
  { create: scheduleTabCreate, list: scheduleTabList },
  { create: scheduleCreatePanel, list: scheduleListPanel }
);
setTabbedPanel(
  'create',
  { create: commandTabCreate, list: commandTabList },
  { create: commandCreatePanel, list: commandListPanel }
);

if (requestPairingBtn) {
  requestPairingBtn.addEventListener('click', async () => {
    if (isWhatsAppReady) {
      if (pairingFeedback) {
        pairingFeedback.textContent = 'Pairing via phone number is disabled while WhatsApp is connected.';
        pairingFeedback.style.color = '#b42318';
      }
      return;
    }

    const phoneNumber = pairingPhoneInput ? pairingPhoneInput.value.trim() : '';
    if (!phoneNumber) {
      if (pairingFeedback) {
        pairingFeedback.textContent = 'Please enter a phone number';
        pairingFeedback.style.color = '#b42318';
      }
      return;
    }

    setButtonBusy(requestPairingBtn, true, 'Requesting...');
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
      setButtonBusy(requestPairingBtn, false);
      requestPairingBtn.disabled = isWhatsAppReady;
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

function setPersonalChatHint(text, color = '#5d645d') {
  if (!personalChatFetchHint) return;
  personalChatFetchHint.textContent = text;
  personalChatFetchHint.style.color = color;
}

function setPersonalChatPickerOptions(chats) {
  if (!personalChatPicker) return;

  const baseOption = '<option value="">Select a personal chat...</option>';
  const optionHtml = chats
    .map((chat) => {
      const safeId = String(chat.id || '').replace(/"/g, '&quot;');
      const safeName = String(chat.name || chat.phone || 'Unnamed');
      const safePhone = String(chat.phone || '').trim();
      const label = safePhone ? `${safeName} (${safePhone})` : safeName;
      return `<option value="${safeId}">${label}</option>`;
    })
    .join('');

  personalChatPicker.innerHTML = baseOption + optionHtml;
}

async function loadPersonalChats(force = false) {
  if (!personalChatPicker) return;
  if (hasLoadedPersonalChats && !force) return;

  personalChatPicker.disabled = true;
  setButtonBusy(refreshPersonalChatsBtn, true, 'Refreshing...');
  setPersonalChatHint('Fetching personal chat list...', '#5d645d');

  try {
    const response = await fetch('/api/whatsapp/personal-chats');
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch personal chats');
    }

    const chats = Array.isArray(data.chats) ? data.chats : [];
    setPersonalChatPickerOptions(chats);
    hasLoadedPersonalChats = true;

    if (chats.length) {
      setPersonalChatHint('Select a chat to auto-fill the destination ID.', '#5d645d');
    } else {
      setPersonalChatHint('No personal chats found on this account.', '#9f4f03');
    }
  } catch (error) {
    setPersonalChatPickerOptions([]);
    setPersonalChatHint(error.message, '#b42318');
  } finally {
    personalChatPicker.disabled = false;
    setButtonBusy(refreshPersonalChatsBtn, false);
    if (refreshPersonalChatsBtn) refreshPersonalChatsBtn.disabled = false;
  }
}

async function loadGroups(force = false) {
  if (!groupPicker) return;
  if (hasLoadedGroups && !force) return;

  groupPicker.disabled = true;
  setButtonBusy(refreshGroupsBtn, true, 'Refreshing...');
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
    setButtonBusy(refreshGroupsBtn, false);
    if (refreshGroupsBtn) refreshGroupsBtn.disabled = false;
  }
}

function syncTargetInputContent() {
  if (!targetTypeInput || !targetValueLabel || !targetHint || !targetValueField) return;

  if (targetTypeInput.value === 'group') {
    targetValueField.hidden = false;
    targetValueLabel.textContent = 'Group ID (example: 1203630xxxx@g.us)';
    targetHint.textContent = 'You can enter 1203630xxxx only or with @g.us suffix';
    if (groupTools) groupTools.hidden = false;
    if (personalChatTools) personalChatTools.hidden = true;
    loadGroups();
    return;
  }

  if (targetTypeInput.value === 'personal-chat') {
    targetValueField.hidden = true;
    if (groupTools) groupTools.hidden = true;
    if (personalChatTools) personalChatTools.hidden = false;
    loadPersonalChats();
    return;
  }

  targetValueField.hidden = false;
  targetValueLabel.textContent = 'Destination Number (62812xxxx)';
  targetHint.textContent = 'Personal example: 6281234567890';
  if (groupTools) groupTools.hidden = true;
  if (personalChatTools) personalChatTools.hidden = true;
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
  document.documentElement.classList.remove('has-route-hash');
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

if (personalChatPicker) {
  personalChatPicker.addEventListener('change', () => {
    const selected = String(personalChatPicker.value || '').trim();
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

if (refreshPersonalChatsBtn) {
  refreshPersonalChatsBtn.addEventListener('click', () => {
    loadPersonalChats(true);
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
    const selectedType = String(formData.get('targetType') || '').trim();
    const selectedPersonalChatId = String(personalChatPicker?.value || '').trim();
    const targetValueRaw = String(formData.get('targetValue') || '').trim();
    const normalizedTargetType =
      selectedType === 'personal-manual' || selectedType === 'personal-chat' ? 'personal' : selectedType;
    const normalizedTargetValue = selectedType === 'personal-chat'
      ? selectedPersonalChatId
      : targetValueRaw;

    const payload = {
      targetType: normalizedTargetType,
      targetValue: normalizedTargetValue,
      message: String(formData.get('message') || '').trim(),
      scheduleAt: String(formData.get('scheduleAt') || '').trim(),
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    };

    if (!payload.targetValue) {
      feedback.textContent = selectedType === 'personal-chat'
        ? 'Please select a personal chat first.'
        : 'Target value is required.';
      feedback.style.color = '#b42318';
      return;
    }

    const scheduleSubmitBtn = form.querySelector('button[type="submit"]');

    feedback.textContent = 'Saving schedule...';
    feedback.style.color = '#5d645d';
    setButtonBusy(scheduleSubmitBtn, true, 'Saving...');

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
      setTimeout(() => window.location.reload(), 120);
    } catch (error) {
      feedback.textContent = error.message;
      feedback.style.color = '#b42318';
    } finally {
      setButtonBusy(scheduleSubmitBtn, false);
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
const commandAdvancedFields = document.getElementById('command-advanced-fields');
const commandTriggerInput = document.getElementById('commandTrigger');
const commandMediaTypeInput = document.getElementById('commandMediaType');
const commandCategoryInput = document.getElementById('commandCategory');
const commandDescriptionInput = document.getElementById('commandDescription');
const commandResponseInput = document.getElementById('commandResponse');
const commandMediaSourceInput = document.getElementById('commandMediaSource');
const commandMediaUrlInput = document.getElementById('commandMediaUrl');
const commandMediaUploadInput = document.getElementById('commandMediaUpload');
const commandMediaUploadHint = document.getElementById('commandMediaUploadHint');
const commandFileNameInput = document.getElementById('commandFileName');
const commandMediaSourceField = document.getElementById('commandMediaSourceField');
const commandMediaUrlField = document.getElementById('commandMediaUrlField');
const commandMediaUploadField = document.getElementById('commandMediaUploadField');
const commandFileNameField = document.getElementById('commandFileNameField');
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
      <option value="cta_copy">Copy Code</option>
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
  valueInput.value = params.id || params.url || params.phone_number || params.copy_code || '';

  function syncPlaceholder() {
    if (typeSelect.value === 'cta_url') {
      valueInput.placeholder = 'https://example.com';
    } else if (typeSelect.value === 'cta_call') {
      valueInput.placeholder = '+60123456789';
    } else if (typeSelect.value === 'cta_copy') {
      valueInput.placeholder = 'DISKAUN10';
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
      else if (type === 'cta_copy') params.copy_code = value;
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

function getNormalizedMediaType() {
  if (!commandMediaTypeInput) return '';
  const selected = String(commandMediaTypeInput.value || '').trim();
  if (!selected || selected === 'none') return '';
  return selected;
}

function isMediaTypeStepReady() {
  if (!commandMediaTypeInput) return false;
  return Boolean(String(commandMediaTypeInput.value || '').trim());
}

function updateCommandSubmitState() {
  if (!commandSubmitBtn) return;

  const trigger = String(commandTriggerInput?.value || '').trim();
  const hasValidTrigger = Boolean(trigger) && trigger.startsWith('!');
  const selectedMediaType = String(commandMediaTypeInput?.value || '').trim();
  const hasMediaType = Boolean(selectedMediaType);
  const isNoMedia = selectedMediaType === 'none';
  const mediaSource = String(commandMediaSourceInput?.value || 'url');
  const hasResponse = Boolean(String(commandResponseInput?.value || '').trim());
  const hasMediaUrl = Boolean(String(commandMediaUrlInput?.value || '').trim());
  const hasUploadFile = Boolean(commandMediaUploadInput?.files && commandMediaUploadInput.files.length);
  const hasMediaInput = isNoMedia
    ? false
    : mediaSource === 'upload'
      ? hasUploadFile || hasMediaUrl
      : hasMediaUrl;
  const isReady = hasValidTrigger && hasMediaType && (hasResponse || hasMediaInput);

  commandSubmitBtn.disabled = !isReady;
  commandSubmitBtn.classList.toggle('is-ready', isReady);
}

function updateCommandFormFlow() {
  const selectedMediaType = String(commandMediaTypeInput?.value || '').trim();
  const showAdvanced = Boolean(selectedMediaType);

  if (commandAdvancedFields) {
    commandAdvancedFields.hidden = !showAdvanced;
  }

  const isNoMedia = selectedMediaType === 'none';
  const isDocument = selectedMediaType === 'document';
  const mediaSource = String(commandMediaSourceInput?.value || 'url');
  const showMediaUrl = showAdvanced && !isNoMedia;
  const showFileName = showAdvanced && isDocument;
  const showMediaSource = showAdvanced && !isNoMedia;
  const useUpload = showMediaSource && mediaSource === 'upload';

  if (commandMediaSourceField) {
    commandMediaSourceField.hidden = !showMediaSource;
  }
  if (commandMediaUrlField) {
    commandMediaUrlField.hidden = !showMediaUrl || useUpload;
  }
  if (commandMediaUrlInput) {
    commandMediaUrlInput.required = showMediaUrl && !useUpload;
    if (!showMediaUrl || useUpload) {
      commandMediaUrlInput.value = '';
    }
  }

  if (commandMediaUploadField) {
    commandMediaUploadField.hidden = !showMediaUrl || !useUpload;
  }
  if (commandMediaUploadInput) {
    commandMediaUploadInput.required = showMediaUrl && useUpload;
    if (!showMediaUrl || !useUpload) {
      commandMediaUploadInput.value = '';
    }
  }
  if (commandMediaUploadHint) {
    commandMediaUploadHint.textContent = useUpload
      ? 'Choose a file to upload and use as media source.'
      : 'Choose URL source or upload source for media.';
  }

  if (commandFileNameField) {
    commandFileNameField.hidden = !showFileName;
  }
  if (commandFileNameInput && !showFileName) {
    commandFileNameInput.value = '';
  }

  updateCommandSubmitState();
}

function resetCommandForm() {
  if (!commandForm) return;
  commandForm.reset();
  clearButtonRows();
  if (commandOriginalTrigger) commandOriginalTrigger.value = '';
  if (commandTriggerInput) commandTriggerInput.disabled = false;
  if (commandSubmitBtn) commandSubmitBtn.textContent = 'Save Command';
  if (commandCancelBtn) commandCancelBtn.hidden = true;
  if (commandMediaSourceInput) commandMediaSourceInput.value = 'url';
  setCommandFeedback('');
  updateCommandFormFlow();
}

function fillCommandForm(command) {
  if (!commandForm || !command) return;

  if (commandTriggerInput) commandTriggerInput.value = command.trigger || '';
  if (commandCategoryInput) commandCategoryInput.value = command.category || 'General';
  if (commandDescriptionInput) commandDescriptionInput.value = command.description || '';
  if (commandResponseInput) commandResponseInput.value = command.response || '';
  if (commandMediaTypeInput) commandMediaTypeInput.value = command.mediaType || 'none';
  if (commandMediaSourceInput) {
    commandMediaSourceInput.value = command.mediaUrl ? 'url' : 'upload';
  }
  if (commandMediaUrlInput) commandMediaUrlInput.value = command.mediaUrl || '';
  if (commandFileNameInput) commandFileNameInput.value = command.fileName || '';

  clearButtonRows();
  (command.buttons || []).forEach((button) => addButtonRow(button));

  if (commandOriginalTrigger) commandOriginalTrigger.value = command.trigger || '';
  if (commandTriggerInput) commandTriggerInput.disabled = true;
  if (commandSubmitBtn) commandSubmitBtn.textContent = 'Update Command';
  if (commandCancelBtn) commandCancelBtn.hidden = false;
  updateCommandFormFlow();

  setTabbedPanel(
    'create',
    { create: commandTabCreate, list: commandTabList },
    { create: commandCreatePanel, list: commandListPanel }
  );

  window.history.pushState(null, '', '#custom-commands');
  showPageByHash('#custom-commands');
  commandForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

if (commandCancelBtn) {
  commandCancelBtn.addEventListener('click', resetCommandForm);
}

if (commandTriggerInput) {
  commandTriggerInput.addEventListener('input', updateCommandFormFlow);
}

if (commandMediaTypeInput) {
  commandMediaTypeInput.addEventListener('change', updateCommandFormFlow);
}

if (commandMediaSourceInput) {
  commandMediaSourceInput.addEventListener('change', updateCommandFormFlow);
}

if (commandResponseInput) {
  commandResponseInput.addEventListener('input', updateCommandSubmitState);
}

if (commandMediaUrlInput) {
  commandMediaUrlInput.addEventListener('input', updateCommandSubmitState);
}

if (commandMediaUploadInput) {
  commandMediaUploadInput.addEventListener('change', updateCommandSubmitState);
}

async function uploadCommandMediaFile(file, mediaType) {
  const formData = new FormData();
  formData.set('mediaFile', file);
  formData.set('mediaType', mediaType);

  const response = await fetch('/api/custom-commands/upload-media', {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to upload media file');
  }

  return data;
}

if (commandForm) {
  commandForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(commandForm);
    const originalTrigger = commandOriginalTrigger ? commandOriginalTrigger.value : '';
    const isEditing = Boolean(originalTrigger);
    const selectedMediaType = String(formData.get('mediaType') || '').trim();
    const selectedMediaSource = String(formData.get('mediaSource') || 'url').trim();

    let mediaUrl = String(formData.get('mediaUrl') || '').trim();
    let fileName = String(formData.get('fileName') || '').trim();

    if (selectedMediaType && selectedMediaType !== 'none' && selectedMediaSource === 'upload') {
      const selectedFile = commandMediaUploadInput?.files?.[0];
      if (selectedFile) {
        setCommandFeedback('Uploading media file...', '#5d645d');
        const uploaded = await uploadCommandMediaFile(selectedFile, selectedMediaType);
        mediaUrl = String(uploaded.mediaUrl || '').trim();
        if (!fileName) {
          fileName = String(uploaded.fileName || '').trim();
        }
      }
    }

    const payload = {
      trigger: String(formData.get('trigger') || '').trim(),
      category: String(formData.get('category') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      response: String(formData.get('response') || '').trim(),
      mediaType: getNormalizedMediaType(),
      mediaUrl,
      fileName,
      buttons: collectButtonsFromRows(),
    };

    setCommandFeedback(isEditing ? 'Updating command...' : 'Saving command...', '#5d645d');
    setButtonBusy(commandSubmitBtn, true, isEditing ? 'Updating...' : 'Saving...');

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
      setTimeout(() => window.location.reload(), 120);
    } catch (error) {
      setCommandFeedback(error.message, '#b42318');
    } finally {
      setButtonBusy(commandSubmitBtn, false);
      updateCommandSubmitState();
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

const commandPreviewModal = document.getElementById('commandPreviewModal');
const closeCommandPreviewModalBtn = document.getElementById('closeCommandPreviewModal');
const commandPreviewImage = document.getElementById('commandPreviewImage');
const commandPreviewVideo = document.getElementById('commandPreviewVideo');
const commandPreviewAudio = document.getElementById('commandPreviewAudio');
const commandPreviewDocument = document.getElementById('commandPreviewDocument');
const commandPreviewDocumentLink = document.getElementById('commandPreviewDocumentLink');
const commandPreviewBadge = document.getElementById('commandPreviewBadge');
const commandPreviewTitle = document.getElementById('commandPreviewTitle');
const commandPreviewDescription = document.getElementById('commandPreviewDescription');
const commandPreviewContent = document.getElementById('commandPreviewContent');
const commandPreviewButtons = document.getElementById('commandPreviewButtons');
const commandPreviewActionBtn = document.getElementById('commandPreviewActionBtn');

function closeCommandPreviewModal() {
  if (!commandPreviewModal) return;

  if (commandPreviewVideo) {
    commandPreviewVideo.pause();
    commandPreviewVideo.removeAttribute('src');
    commandPreviewVideo.load();
  }

  if (commandPreviewAudio) {
    commandPreviewAudio.pause();
    commandPreviewAudio.removeAttribute('src');
    commandPreviewAudio.load();
  }

  commandPreviewModal.hidden = true;
  document.body.style.overflow = '';
}

function parseButtonParams(button) {
  if (!button || typeof button !== 'object') return {};
  if (typeof button.buttonParamsJson !== 'string') return {};

  try {
    const parsed = JSON.parse(button.buttonParamsJson);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function resetCommandPreviewMedia() {
  if (commandPreviewImage) {
    commandPreviewImage.hidden = false;
  }

  if (commandPreviewVideo) {
    commandPreviewVideo.hidden = true;
  }

  if (commandPreviewAudio) {
    commandPreviewAudio.hidden = true;
  }

  if (commandPreviewDocument) {
    commandPreviewDocument.hidden = true;
  }
}

function renderCommandPreviewButtons(command) {
  if (!commandPreviewButtons) return;

  commandPreviewButtons.innerHTML = '';
  const list = Array.isArray(command.buttons) ? command.buttons : [];
  if (!list.length) {
    commandPreviewButtons.hidden = true;
    return;
  }

  list.forEach((buttonItem) => {
    const params = parseButtonParams(buttonItem);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn wa-preview-chip';
    button.textContent = params.display_text || 'Button';

    const kind = String(buttonItem.name || '').trim();
    if (kind === 'cta_url' && params.url) {
      button.addEventListener('click', () => window.open(params.url, '_blank', 'noopener'));
    } else if (kind === 'cta_call' && params.phone_number) {
      button.addEventListener('click', () => window.open(`tel:${params.phone_number}`, '_self'));
    } else if (kind === 'cta_copy' && params.copy_code) {
      button.addEventListener('click', async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(params.copy_code);
            button.textContent = 'Copied';
            setTimeout(() => {
              button.textContent = params.display_text || 'Button';
            }, 1200);
          }
        } catch (error) {
          // Ignore clipboard errors and keep button usable.
        }
      });
    }

    commandPreviewButtons.appendChild(button);
  });

  commandPreviewButtons.hidden = false;
}

function openCommandPreviewModal(command) {
  if (!commandPreviewModal || !command) return;

  const fallbackCover = 'https://avatar.vercel.sh/shadcn1';
  const mediaType = String(command.mediaType || '').trim();
  const mediaUrl = String(command.mediaUrl || '').trim();
  const mediaTypeLabel = mediaType ? mediaType.toUpperCase() : 'TEXT';
  const description = command.description
    ? String(command.description)
    : 'online';
  const textContent = String(command.response || '').trim();

  resetCommandPreviewMedia();

  if (commandPreviewImage) {
    commandPreviewImage.src = fallbackCover;
    commandPreviewImage.alt = mediaUrl
      ? `Media preview ${command.trigger || ''}`
      : 'Command cover';
  }

  if (mediaUrl && mediaType === 'image' && commandPreviewImage) {
    commandPreviewImage.src = mediaUrl;
    commandPreviewImage.hidden = false;
  }

  if (mediaUrl && mediaType === 'video' && commandPreviewVideo) {
    commandPreviewImage.hidden = true;
    commandPreviewVideo.src = mediaUrl;
    commandPreviewVideo.hidden = false;
  }

  if (mediaUrl && mediaType === 'audio' && commandPreviewAudio) {
    commandPreviewAudio.src = mediaUrl;
    commandPreviewAudio.hidden = false;
  }

  if (mediaUrl && mediaType === 'document' && commandPreviewDocument && commandPreviewDocumentLink) {
    commandPreviewDocument.hidden = false;
    commandPreviewDocumentLink.href = mediaUrl;
    commandPreviewDocumentLink.textContent = command.fileName || 'Open document';
  }

  if (commandPreviewBadge) {
    commandPreviewBadge.textContent = mediaTypeLabel;
  }

  if (commandPreviewTitle) {
    commandPreviewTitle.textContent = command.trigger || 'Command Preview';
  }

  if (commandPreviewDescription) {
    commandPreviewDescription.textContent = description;
  }

  if (commandPreviewContent) {
    if (textContent) {
      commandPreviewContent.textContent = textContent;
      commandPreviewContent.hidden = false;
    } else {
      commandPreviewContent.textContent = '';
      commandPreviewContent.hidden = true;
    }
  }

  renderCommandPreviewButtons(command);

  if (commandPreviewActionBtn) {
    commandPreviewActionBtn.onclick = () => {
      closeCommandPreviewModal();
      fillCommandForm(command);
    };
  }

  commandPreviewModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

document.querySelectorAll('.btn-preview-command').forEach((button) => {
  button.addEventListener('click', () => {
    const trigger = button.dataset.trigger;
    if (!trigger) return;

    const command = commandsByTrigger.get(trigger);
    if (!command) return;

    openCommandPreviewModal(command);
  });
});

if (commandPreviewModal) {
  commandPreviewModal.addEventListener('click', (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.closeModal === 'command-preview') {
      closeCommandPreviewModal();
    }
  });
}

if (closeCommandPreviewModalBtn) {
  closeCommandPreviewModalBtn.addEventListener('click', closeCommandPreviewModal);
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && commandPreviewModal && !commandPreviewModal.hidden) {
    closeCommandPreviewModal();
  }
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

const clearDeletedMessagesBtn = document.getElementById('clearDeletedMessagesBtn');

document.querySelectorAll('.btn-delete-deleted-message').forEach((button) => {
  button.addEventListener('click', async () => {
    const id = button.dataset.id;
    if (!id) return;

    const confirmDelete = window.confirm('Remove this record?');
    if (!confirmDelete) return;

    try {
      const response = await fetch(`/api/deleted-messages/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!response.ok && response.status !== 204) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove record');
      }
      window.location.reload();
    } catch (error) {
      window.alert(error.message);
    }
  });
});

if (clearDeletedMessagesBtn) {
  clearDeletedMessagesBtn.addEventListener('click', async () => {
    const confirmClear = window.confirm('Clear all deleted message records?');
    if (!confirmClear) return;

    try {
      const response = await fetch('/api/deleted-messages', { method: 'DELETE' });
      if (!response.ok && response.status !== 204) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to clear records');
      }
      window.location.reload();
    } catch (error) {
      window.alert(error.message);
    }
  });
}

updateCommandFormFlow();
finishInitialBoot();
