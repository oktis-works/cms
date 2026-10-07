import { createSignal, Show, onMount } from 'solid-js';
import { useTranslation } from '../../i18n';
import { SUPPORTED_LOCALES, LOCALE_LABELS, LOCALE_FLAGS } from '../../i18n/config';
import type { Locale } from '../../i18n/config';
import { apiClient } from '../../lib/api';
import type { AuditLogEntry, CurrentUser } from '../../lib/api';

interface Props {
  user?: CurrentUser | null;
}

export function AdminBar(props: Props) {
  const { locale, changeLocale, t } = useTranslation();
  const [user, setUser] = createSignal<CurrentUser | null>(props.user ?? null);
  const [showUserMenu, setShowUserMenu] = createSignal(false);
  const [showLangMenu, setShowLangMenu] = createSignal(false);
  const [showNotifications, setShowNotifications] = createSignal(false);
  const [notifications, setNotifications] = createSignal<AuditLogEntry[]>([]);

  const currentLocale = () => locale as Locale;
  const translate = t as (key: string, params?: Record<string, string | number>) => string;

  const handleClickOutside = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('#admin-bar')) {
      setShowUserMenu(false);
      setShowLangMenu(false);
      setShowNotifications(false);
    }
  };

  onMount(() => {
    // Guard SSR: document/window só existem no client
    if (typeof document === 'undefined') return;

    document.addEventListener('click', handleClickOutside);

    // Sessão real (/auth/me) — o admin bar nunca é "sempre deslogado"
    void (async () => {
      if (props.user) return;
      try {
        const me = await apiClient.getMe();
        setUser(me.user);
      } catch {
        // 401/expirado — o guarda de sessão do layout redireciona pro login
      }
    })();

    // Notificações reais: entradas recentes da auditoria (403 ⇒ sino sem badge)
    void (async () => {
      try {
        const logs = await apiClient.getAuditLogs(8);
        setNotifications(logs.data ?? []);
      } catch {
        setNotifications([]);
      }
    })();

    return () => document.removeEventListener('click', handleClickOutside);
  });

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return translate('activity.justNow');
    if (minutes < 60) return `${minutes} ${translate('activity.minAgo')}`;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours}h ${translate('activity.ago')}`;
    const days = Math.floor(diff / 86400000);
    if (days < 7) return `${days}d ${translate('activity.ago')}`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const handleLogout = async () => {
    try {
      await apiClient.logout();
    } catch {
      // sem rede/sessão expirada — seguimos para o login mesmo assim
    }
    window.location.href = '/login';
  };

  const toggleSidebar = () => {
    document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem('sidebar-collapsed', document.body.classList.contains('sidebar-collapsed').toString());
  };

  return (
    <>
      <style>{`
        #admin-bar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 46px;
          background: #0A0A0A;
          border-bottom: 1px solid #333;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1rem;
          z-index: 2000;
          font-family: inherit;
        }
        #admin-bar * { box-sizing: border-box; }
        .admin-bar-left, .admin-bar-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .admin-bar-brand {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #FAF5E8;
          font-weight: 600;
          font-size: 1.125rem;
          text-decoration: none;
          padding: 0.375rem 0.75rem;
          border-radius: 0.375rem;
          transition: background 0.15s;
        }
        .admin-bar-brand:hover {
          background: rgba(255,255,255,0.08);
        }
        .admin-bar-brand svg { width: 28px; height: 28px; }
        .admin-bar-separator { width: 1px; height: 24px; background: #333; }
        .admin-bar-menu { display: flex; gap: 0.25rem; }
        .admin-bar-menu-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.375rem 0.75rem;
          color: rgba(255,255,255,0.7);
          font-size: 0.8125rem;
          font-weight: 500;
          border-radius: 0.375rem;
          text-decoration: none;
          transition: all 0.15s;
        }
        .admin-bar-menu-item:hover {
          background: rgba(255,255,255,0.1);
          color: #fff;
        }
        .admin-bar-menu-item svg { width: 18px; height: 18px; }
        .admin-bar-right { gap: 0.75rem; }
        .notifications-btn {
          position: relative;
          background: none;
          border: none;
          color: rgba(255,255,255,0.7);
          padding: 0.375rem;
          border-radius: 0.375rem;
          cursor: pointer;
          transition: all 0.15s;
        }
        .notifications-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .notifications-badge {
          position: absolute;
          top: 2px;
          right: 2px;
          min-width: 16px;
          height: 16px;
          background: #EF4444;
          color: #fff;
          font-size: 0.625rem;
          font-weight: 600;
          border-radius: 9999px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
        }
        .notifications-dropdown { position: relative; }
        .lang-dropdown {
          position: relative;
          display: flex;
          align-items: center;
        }
        .lang-dropdown > .notifications-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          min-height: 32px;
          line-height: 1;
          white-space: nowrap;
        }
        .notifications-panel {
          position: absolute;
          top: calc(100% + 0.5rem);
          right: 0;
          min-width: 280px;
          max-width: 90vw;
          background: #FFFFFF;
          border: 1px solid #DCDCDE;
          border-radius: 0.5rem;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1);
          z-index: 2100;
          overflow: hidden;
          animation: slideIn 0.15s ease-out;
        }
        .notifications-header {
          padding: 0.75rem 1rem;
          font-size: 0.6875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #646970;
          border-bottom: 1px solid #DCDCDE;
        }
        .notifications-item {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
          padding: 0.625rem 1rem;
          border-bottom: 1px solid #F6F7F7;
        }
        .notifications-item:last-child { border-bottom: none; }
        .notifications-action {
          font-size: 0.8125rem;
          font-weight: 600;
          color: #2C3338;
          font-family: ui-monospace, SFMono-Regular, monospace;
          word-break: break-word;
        }
        .notifications-meta {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          font-size: 0.6875rem;
          color: #646970;
        }
        .notifications-empty { padding: 1rem; margin: 0; font-size: 0.8125rem; color: #646970; }
        .user-menu-trigger {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: none;
          border: none;
          color: #fff;
          padding: 0.375rem 0.75rem;
          border-radius: 0.375rem;
          cursor: pointer;
          font-size: 0.8125rem;
          font-weight: 500;
          transition: background 0.15s;
        }
        .user-menu-trigger:hover { background: rgba(255,255,255,0.1); }
        .user-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(135deg, #D8B45E 0%, #B99542 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 0.875rem;
          color: #0A0A0A;
        }
        .user-menu-dropdown {
          position: absolute;
          top: calc(100% + 0.5rem);
          right: 0;
          min-width: 200px;
          background: #FFFFFF;
          border: 1px solid #DCDCDE;
          border-radius: 0.5rem;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1);
          z-index: 2100;
          overflow: hidden;
          animation: slideIn 0.15s ease-out;
        }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-0.5rem); } to { opacity: 1; transform: translateY(0); } }
        .user-menu-header {
          padding: 1rem;
          border-bottom: 1px solid #DCDCDE;
        }
        .user-menu-name { font-weight: 600; color: #0A0A0A; font-size: 0.875rem; }
        .user-menu-email { color: #646970; font-size: 0.75rem; margin-top: 0.125rem; }
        .user-menu-divider { height: 1px; background: #DCDCDE; }
        .user-menu-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.625rem 1rem;
          background: none;
          border: none;
          color: #2C3338;
          font-size: 0.8125rem;
          font-weight: 500;
          text-align: left;
          cursor: pointer;
          transition: background 0.15s;
        }
        .user-menu-item:hover { background: #F6F7F7; }
        .user-menu-item svg { width: 18px; height: 18px; color: #646970; }
        .user-menu-item.danger { color: #EF4444; }
        .user-menu-item.danger:hover { background: #FEF2F2; }
        .lang-menu-dropdown {
          position: absolute;
          top: calc(100% + 0.5rem);
          right: 0;
          min-width: 192px;
          max-height: min(18rem, calc(100vh - 3.5rem));
          background: #FFFFFF;
          border: 1px solid #DCDCDE;
          border-radius: 0.5rem;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1);
          z-index: 2100;
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
          animation: slideIn 0.15s ease-out;
        }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-0.5rem); } to { opacity: 1; transform: translateY(0); } }
        .lang-menu-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.625rem 1rem;
          background: none;
          border: none;
          color: #2C3338;
          font-size: 0.8125rem;
          font-weight: 500;
          text-align: left;
          cursor: pointer;
          min-height: 36px;
        }
        .lang-menu-item:hover { background: #F6F7F7; }
        .lang-menu-item.active { background: #FAF5E8; color: #B99542; font-weight: 600; }
        .lang-menu-item .flag { font-size: 1rem; }
        @media (max-width: 782px) {
          .admin-bar-menu { display: none; }
        }
      `}</style>

      <header id="admin-bar" role="banner">
        <div class="admin-bar-left">
          <a href="/" class="admin-bar-brand" aria-label={t('layout.appName')}>
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect width="32" height="32" rx="8" fill="url(#grad)"/>
              <path d="M8 10h16M8 16h12M8 22h8" stroke="#0A0A0A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#D8B45E"/>
                  <stop offset="100%" stop-color="#B99542"/>
                </linearGradient>
              </defs>
            </svg>
            <span>OkCMS</span>
          </a>

          <div class="admin-bar-separator"></div>

          <nav class="admin-bar-menu" aria-label={t('adminBar.mainMenu')}>
            <a href="/content" class="admin-bar-menu-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              {t('layout.nav.content')}
            </a>
            <a href="/media" class="admin-bar-menu-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              {t('layout.nav.media')}
            </a>
            <a href="/settings" class="admin-bar-menu-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              {t('layout.nav.settings')}
            </a>
          </nav>
        </div>

        <div class="admin-bar-right">
          <div class="notifications-dropdown">
            <button
              class="notifications-btn"
              aria-label={t('adminBar.notifications')}
              aria-expanded={showNotifications()}
              onClick={() => setShowNotifications(!showNotifications())}
              type="button"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <Show when={notifications().length > 0}>
                <span class="notifications-badge">{notifications().length}</span>
              </Show>
            </button>
            <Show when={showNotifications()}>
              <div class="notifications-panel" role="menu" aria-label={t('adminBar.notifications')}>
                <div class="notifications-header">{t('adminBar.notifications')}</div>
                <Show
                  when={notifications().length > 0}
                  fallback={<p class="notifications-empty">{t('adminBar.notificationsEmpty')}</p>}
                >
                  {notifications().map((entry) => (
                    <div class="notifications-item" role="menuitem">
                      <span class="notifications-action">{entry.action}</span>
                      <span class="notifications-meta">
                        <span class="notifications-resource">{entry.resourceType}</span>
                        <span class="notifications-time">{formatTime(entry.created_at)}</span>
                      </span>
                    </div>
                  ))}
                </Show>
              </div>
            </Show>
          </div>

          <div class="lang-dropdown">
            <button class="notifications-btn" aria-label={t('common.language')} aria-expanded={showLangMenu()} onClick={() => setShowLangMenu(!showLangMenu())}>
              <span class="flag">{LOCALE_FLAGS[currentLocale()] ?? '🌐'}</span>
              <span>{LOCALE_LABELS[currentLocale()] ?? currentLocale()}</span>
              <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
            <Show when={showLangMenu()}>
              <div class="lang-menu-dropdown" role="menu" aria-label={t('common.language')}>
                {SUPPORTED_LOCALES.map((loc) => (
                  <button
                    class={currentLocale() === loc ? 'lang-menu-item active' : 'lang-menu-item'}
                    onClick={() => { changeLocale(loc); setShowLangMenu(false); }}
                    type="button"
                    role="menuitem"
                  >
                    <span class="flag">{LOCALE_FLAGS[loc] ?? '🌐'}</span>
                    {LOCALE_LABELS[loc] ?? loc}
                  </button>
                ))}
              </div>
            </Show>
          </div>

          <Show when={user()}>
            <div class="user-menu-dropdown-wrapper">
              <button
                class="user-menu-trigger"
                aria-label={t('adminBar.userMenu')}
                aria-expanded={showUserMenu()}
                onClick={() => setShowUserMenu(!showUserMenu())}
                type="button"
              >
                <span class="user-avatar">
                  {user()?.name?.charAt(0).toUpperCase() ?? 'U'}
                </span>
                <span>{user()?.name}</span>
                <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
              <Show when={showUserMenu()}>
                <div class="user-menu-dropdown" role="menu" aria-label={t('adminBar.userMenu')}>
                  <div class="user-menu-header">
                    <div class="user-menu-name">{user()?.name}</div>
                    <div class="user-menu-email">{user()?.email}</div>
                  </div>
                  <div class="user-menu-divider"></div>
                  <button class="user-menu-item" type="button" role="menuitem" onClick={() => { window.location.href = '/settings'; setShowUserMenu(false); }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    {t('adminBar.settings')}
                  </button>
                  <div class="user-menu-divider"></div>
                  <button class="user-menu-item danger" type="button" role="menuitem" onClick={handleLogout}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    {t('layout.actions.logout')}
                  </button>
                </div>
              </Show>
            </div>
          </Show>

          <Show when={!user()}>
            <a href="/login" class="btn btn-primary" style="padding: 0.375rem 1rem; font-size: 0.8125rem;">
              {t('login.submit')}
            </a>
          </Show>

          <button
            class="sidebar-toggle"
            aria-label={t('adminBar.toggleSidebar')}
            onClick={toggleSidebar}
            type="button"
            style="background:none;border:none;color:rgba(255,255,255,0.7);padding:0.375rem;border-radius:0.375rem;cursor:pointer;display:flex;align-items:center;justify-content:center;"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        </div>
      </header>
    </>
  );
}
