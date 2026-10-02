// @oktis-works/api - Pages Routes (Content with type=page)
// Maps to SDD endpoint: /api/v1/pages

import { createContentCollectionRouter } from '../shared/content-collection.js';

const pagesRouter = createContentCollectionRouter({ type: 'page', name: 'page' });

export default pagesRouter;
