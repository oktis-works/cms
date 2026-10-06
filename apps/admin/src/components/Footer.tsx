import { useTranslation } from '../i18n';
import { APP_VERSION } from '../lib/version';

export function Footer() {
  const { t } = useTranslation();
  const version = APP_VERSION;

  return (
    <footer class="admin-footer" role="contentinfo">
      <div class="footer-content">
        <div class="footer-left">
          <p class="footer-version">
            <span class="product-name">OkCMS</span>
            <span class="version-badge">v{version}</span>
          </p>
          <p class="footer-copyright">{t('footer.copyright')}</p>
        </div>

        <nav class="footer-links" aria-label={t('footer.links')}>
          <a href="https://oktisworks.com" target="_blank" rel="noopener noreferrer">
            {t('footer.website')}
          </a>
          <a href="https://github.com/oktis-works/cms" target="_blank" rel="noopener noreferrer">
            {t('footer.github')}
          </a>
          <a href="https://docs.oktisworks.com" target="_blank" rel="noopener noreferrer">
            {t('footer.docs')}
          </a>
          <a href="https://oktisworks.com/community" target="_blank" rel="noopener noreferrer">
            {t('footer.community')}
          </a>
        </nav>

        <div class="footer-right">
          <p class="footer-powered">{t('footer.poweredBy')}</p>
        </div>
      </div>

      <style>{`
        .admin-footer {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 48px;
          background: var(--color-surface);
          border-top: 1px solid var(--color-border);
          padding: 0 1.5rem;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.75rem;
          color: var(--color-muted);
        }

        .footer-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          max-width: 1400px;
          margin: 0 auto;
          gap: 1.5rem;
        }

        .footer-left { display: flex; flex-direction: column; gap: 0.125rem; }

        .footer-version {
          display: flex; align-items: center; gap: 0.5rem;
          font-weight: 600; color: var(--color-text); font-size: 0.8125rem;
        }

        .version-badge {
          background: var(--color-primary-soft);
          color: var(--color-primary-hover);
          padding: 0.125rem 0.375rem;
          border-radius: var(--radius-sm);
          font-size: 0.6875rem;
          font-weight: 700;
        }

        .footer-copyright { font-size: 0.6875rem; color: var(--color-muted); }

        .footer-links {
          display: flex; gap: 1.5rem;
        }

        .footer-links a {
          color: var(--color-muted);
          font-size: 0.75rem;
          font-weight: 500;
          text-decoration: none;
          transition: color 0.15s;
        }

        .footer-links a:hover { color: var(--color-primary); }

        .footer-right { text-align: right; }
        .footer-powered { font-size: 0.6875rem; color: var(--color-muted); }

        @media (max-width: 768px) {
          .admin-footer { flex-direction: column; height: auto; padding: 0.75rem 1rem; gap: 0.5rem; }
          .footer-content { flex-direction: column; gap: 0.5rem; }
          .footer-links { flex-wrap: wrap; justify-content: center; }
        }

        /* RTL adjustments */
        [dir="rtl"] .footer-links { flex-direction: row-reverse; }
        [dir="rtl"] .footer-right { text-align: left; }
        [dir="rtl"] .footer-left { align-items: flex-end; }
      `}</style>
    </footer>
  );
}