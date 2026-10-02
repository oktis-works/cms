// @oktis-works/api - Posts Routes (Content with type=post)
// Maps to SDD endpoint: /api/v1/posts

import { createContentCollectionRouter } from '../shared/content-collection.js';

const postsRouter = createContentCollectionRouter({ type: 'post', name: 'post' });

export default postsRouter;
