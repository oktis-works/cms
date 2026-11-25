import Home from '../home';
import Index from '../index';
import Single from '../single';
import Page from '../page';
import Archive from '../archive';
import NotFound from '../404';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FC } from 'react';
import type { ThemePageData, ThemeRenderContext, ThemeRenderOutput } from '@oktis-works/theme-sdk';

const templates: Record<string, FC<ThemePageData>> = {
  'home': Home,
  'index': Index,
  'single': Single,
  'page': Page,
  'archive': Archive,
  '404': NotFound,
};

export const templateKeys = Object.keys(templates);

export function render(
  key: string,
  data: ThemePageData,
  _ctx?: ThemeRenderContext
): ThemeRenderOutput {
  const Component = templates[key] ?? templates['404'];
  return { html: renderToStaticMarkup(<Component {...data} />) };
}