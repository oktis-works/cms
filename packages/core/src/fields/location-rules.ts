// @oktis-works/core - Field Group Location Rules

export type LocationParam =
  | 'content_type'
  | 'content_slug'
  | 'taxonomy'
  | 'term'
  | 'user_role'
  | 'page_template'
  | 'post_status';

export interface LocationRule {
  param: LocationParam;
  operator: 'eq' | 'neq';
  value: string;
}

export interface LocationContext {
  contentType?: string;
  contentSlug?: string;
  taxonomy?: string;
  termSlug?: string;
  userRole?: string;
  pageTemplate?: string;
  postStatus?: string;
}

function matchesRule(rule: LocationRule, context: LocationContext): boolean {
  const actual: Record<LocationParam, string | undefined> = {
    content_type: context.contentType,
    content_slug: context.contentSlug,
    taxonomy: context.taxonomy,
    term: context.termSlug,
    user_role: context.userRole,
    page_template: context.pageTemplate,
    post_status: context.postStatus,
  };

  const expected = actual[rule.param];

  if (rule.operator === 'neq') {
    return expected !== rule.value;
  }

  return expected === rule.value;
}

export function matchLocationRules(groups: LocationRule[][], context: LocationContext): boolean {
  if (!groups || groups.length === 0) return false;

  // Compatibilidade com o formato simplificado usado pelas migrations
  // antigas: { content_type: ["post"] }.
  if (!Array.isArray(groups)) {
    const shorthand = groups as unknown as Record<string, unknown>;
    const normalized = Object.entries(shorthand).flatMap(([param, values]) =>
      (Array.isArray(values) ? values : [values]).map((value) => [{
        param: param as LocationParam,
        operator: 'eq' as const,
        value: String(value),
      }])
    );
    return matchLocationRules(normalized, context);
  }

  return groups.some((group) =>
    group.length > 0 ? group.every((rule) => matchesRule(rule, context)) : false
  );
}
