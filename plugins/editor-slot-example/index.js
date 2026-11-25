/**
 * editor-slot-example - Minimal wiring for a plugin-built block editor.
 *
 * The editor, block, and pattern are declared once in manifest.json. The
 * runtime entrypoint adds the save-time compilation hook without registering
 * duplicate declarations.
 */
module.exports.register = async function register(api) {
  api.addFilter('before_save_content_post', (body) => {
    if (!body || typeof body !== 'object') return body;
    if (!body['_editor']) return body;
    return { ...body, content: body['content'] ?? '' };
  });
};
