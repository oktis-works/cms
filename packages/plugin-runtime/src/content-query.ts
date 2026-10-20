// @oktis-works/plugin-runtime - Typed content query builder (Item 22)
//
// Declarative, parameterized filtering for `api.content.query()` — plugins
// describe the query (no raw SQL). Field names are allowlisted to real
// content columns, operators map to parameterized SQL and every value goes
// through placeholders (no string interpolation of user data).

const ALLOWED_FIELDS = new Set([
  'id',
  'type',
  'slug',
  'title',
  'excerpt',
  'status',
  'author_id',
  'featured_image_id',
  'seo_title',
  'layout',
  'created_at',
  'updated_at',
  'published_at',
]);

const OPERATORS: Record<string, string> = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'ILIKE',
};

export interface ContentQueryFilter {
  field: string;
  op: keyof typeof OPERATORS | 'in';
  value: unknown;
}

export class ContentQueryBuilder {
  private filters: ContentQueryFilter[] = [];
  private order: Array<{ field: string; dir: 'ASC' | 'DESC' }> = [];
  private limitValue = 50;
  private offsetValue = 0;

  constructor(private readonly executeFn: (query: string, params?: unknown[]) => Promise<unknown[]>) {}

  /** Adds a single-value condition (field must be an allowlisted column). */
  where(field: string, op: keyof typeof OPERATORS, value: unknown): this {
    if (!ALLOWED_FIELDS.has(field)) {
      throw new Error(`Field "${field}" is not queryable (allowed: ${[...ALLOWED_FIELDS].join(', ')})`);
    }
    if (!(op in OPERATORS)) {
      throw new Error(`Operator "${String(op)}" is not supported`);
    }
    this.filters.push({ field, op, value });
    return this;
  }

  /** Adds an IN condition over an array of values. */
  whereIn(field: string, values: readonly unknown[]): this {
    if (!ALLOWED_FIELDS.has(field)) {
      throw new Error(`Field "${field}" is not queryable (allowed: ${[...ALLOWED_FIELDS].join(', ')})`);
    }
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('whereIn requires a non-empty array');
    }
    this.filters.push({ field, op: 'in', value: values });
    return this;
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'desc'): this {
    if (!ALLOWED_FIELDS.has(field)) {
      throw new Error(`Field "${field}" is not orderable (allowed: ${[...ALLOWED_FIELDS].join(', ')})`);
    }
    this.order.push({ field, dir: dir.toUpperCase() as 'ASC' | 'DESC' });
    return this;
  }

  limit(n: number): this {
    if (!Number.isFinite(n) || n < 1 || n > 200) {
      throw new Error('limit must be between 1 and 200');
    }
    this.limitValue = Math.floor(n);
    return this;
  }

  offset(n: number): this {
    if (!Number.isFinite(n) || n < 0) {
      throw new Error('offset must be >= 0');
    }
    this.offsetValue = Math.floor(n);
    return this;
  }

  /** Renders the parameterized SQL + params (exported for tests/debug). */
  build(): { sql: string; params: unknown[] } {
    const clauses: string[] = [];
    const params: unknown[] = [];

    for (const filter of this.filters) {
      if (filter.op === 'in') {
        const values = (filter.value as readonly unknown[]).map((value) => {
          params.push(value);
          return `$${params.length}`;
        });
        clauses.push(`${filter.field} IN (${values.join(', ')})`);
        continue;
      }
      params.push(filter.value);
      clauses.push(`${filter.field} ${OPERATORS[filter.op]} $${params.length}`);
    }

    const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
    const order = this.order.length > 0 ? ` ORDER BY ${this.order.map((entry) => `${entry.field} ${entry.dir}`).join(', ')}` : '';
    const sqlText = `SELECT * FROM content${where}${order} LIMIT ${this.limitValue} OFFSET ${this.offsetValue}`;
    return { sql: sqlText, params };
  }

  execute(): Promise<unknown[]> {
    const { sql, params } = this.build();
    return this.executeFn(sql, params);
  }
}
