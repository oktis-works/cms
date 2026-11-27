import { hydrateRoot } from 'react-dom/client';
import { readThemeHydrationPayload } from '@oktis-works/theme-sdk';
import Home from '../home';
import Index from '../index';
import Single from '../single';
import Page from '../page';
import Archive from '../archive';
import NotFound from '../404';
import type { ThemePageData } from '@oktis-works/theme-sdk';

const templates: Record<string, (props: ThemePageData) => JSX.Element> = {
  home: Home,
  index: Index,
  single: Single,
  page: Page,
  archive: Archive,
  404: NotFound,
};

const payload = readThemeHydrationPayload();
if (!payload) {
  throw new Error('Theme hydration payload not found');
}

const { templateKey, data } = payload;
const Component = templates[templateKey] ?? templates['404'];

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

hydrateRoot(root, <Component {...data} />);