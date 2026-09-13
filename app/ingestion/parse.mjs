const LIMIT = 60000;
function date(value) {
  if (value == null) return null;
  const d = new Date(typeof value === 'number' ? value * 1000 : value);
  return Number.isNaN(d.valueOf()) ? null : d.toISOString();
}
export function documentParts(title, body, metadata = {}) {
  if (typeof body !== 'string' || !body.trim()) return [];
  const parts = [];
  for (let start = 0; start < body.length; start += LIMIT) {
    let end = Math.min(start + LIMIT, body.length);
    if (end < body.length && /[\uD800-\uDBFF]/.test(body[end - 1])) end--;
    parts.push(body.slice(start, end));
    if (end < start + LIMIT) start--;
  }
  return parts
    .filter((p) => p.trim())
    .map((part, i) => ({
      title: (parts.length > 1 ? `${title} — part ${i + 1}` : title).slice(
        0,
        200,
      ),
      body: part,
      origin: `file:${metadata.filename || title}`,
      metadata: {
        ...metadata,
        ...(parts.length > 1 ? { part: i + 1, parts: parts.length } : {}),
      },
      warnings: [],
    }));
}
function conversation(chat, filename) {
  if (!chat.mapping || typeof chat.mapping !== 'object')
    throw new Error(
      'Unsupported conversation structure. Expected a ChatGPT mapping export.',
    );
  const mapping = chat.mapping,
    warnings = [];
  let cursor = chat.current_node;
  if (!mapping[cursor]) {
    const parents = new Set(Object.values(mapping).map((n) => n?.parent));
    const leaves = Object.keys(mapping).filter((k) => !parents.has(k));
    cursor = leaves.sort(
      (a, b) =>
        (mapping[b]?.message?.create_time || 0) -
        (mapping[a]?.message?.create_time || 0),
    )[0];
    warnings.push(
      'No active branch marker; the latest leaf branch was selected.',
    );
  }
  const branch = cursor;
  const path = [],
    seen = new Set();
  while (cursor) {
    if (seen.has(cursor))
      throw new Error('Conversation contains a cyclic branch.');
    seen.add(cursor);
    const node = mapping[cursor];
    if (!node)
      throw new Error('Conversation branch refers to a missing message.');
    if (node.message) path.push(node.message);
    cursor = node.parent;
  }
  const texts = [];
  let omitted = 0;
  for (const m of path.reverse()) {
    const role = m.author?.role;
    if (!['user', 'assistant'].includes(role)) {
      omitted++;
      continue;
    }
    const parts = m.content?.parts || [];
    const text = parts.filter((p) => typeof p === 'string').join('\n');
    if (parts.some((p) => typeof p !== 'string')) omitted++;
    if (!text.trim()) continue;
    const timestamp = date(m.create_time);
    texts.push(
      `${role === 'user' ? 'User' : 'Assistant'}${timestamp ? ` [${timestamp}]` : ''}\n${text}`,
    );
  }
  if (omitted)
    warnings.push(
      'Non-text attachments and system/tool messages are omitted; keep the original export.',
    );
  const docs = documentParts(
    chat.title || 'Untitled conversation',
    texts.join('\n\n'),
    {
      filename,
      format: 'chatgpt',
      conversation_id: chat.id || chat.conversation_id || null,
      source_created_at: date(chat.create_time),
      source_updated_at: date(chat.update_time),
      branch: branch || null,
    },
  );
  return docs.map((d) => ({ ...d, warnings }));
}
/** @param {string} filename @param {string} text @param {number|null} [lastModified] */
export function parseText(filename, text, lastModified = null) {
  if (typeof text !== 'string') throw new Error('Expected text.');
  text = text.replace(/^\uFEFF/, '');
  if (/\.json$/i.test(filename)) {
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error(
        'Invalid JSON. Choose the conversations.json file from an extracted ChatGPT export.',
      );
    }
    if (
      value?.format === 'continuum-import-v1' &&
      Array.isArray(value.documents)
    ) {
      return value.documents.flatMap((d) => {
        if (typeof d.title !== 'string' || typeof d.body !== 'string')
          throw new Error('Invalid prepared import document.');
        return documentParts(d.title, d.body, {
          ...d.metadata,
          filename: d.metadata?.filename || filename,
        });
      });
    }
    const chats = Array.isArray(value)
      ? value
      : value?.mapping
        ? [value]
        : null;
    if (
      !chats ||
      !chats.length ||
      !chats.every((c) => c && typeof c.mapping === 'object')
    )
      throw new Error(
        'Unsupported JSON. Use a ChatGPT conversations.json export or a Continuum prepared import.',
      );
    const docs = chats.flatMap((c) => conversation(c, filename));
    if (!docs.length)
      throw new Error('No user or assistant text was found in this export.');
    return docs;
  }
  if (!/\.(txt|md|markdown)$/i.test(filename))
    throw new Error(
      'Use TXT, Markdown, ChatGPT JSON, or a text-based PDF. Unzip exports first.',
    );
  const heading = text.match(/^#\s+(.+)$/m)?.[1];
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const meta = {
    filename,
    format: /\.txt$/i.test(filename) ? 'text' : 'markdown',
    file_modified_at: lastModified
      ? new Date(lastModified).toISOString()
      : null,
  };
  if (front) {
    for (const key of ['date', 'created', 'updated']) {
      const v = front[1].match(
        new RegExp(`^${key}:\\s*["']?([^\\r\\n"']+)`, 'm'),
      )?.[1];
      if (v) meta[`source_${key}`] = v.trim();
    }
  }
  return documentParts(heading || filename.replace(/\.[^.]+$/, ''), text, meta);
}
export async function markDuplicates(documents, existing) {
  const seen = new Set(existing.map((s) => s.hash));
  const result = [];
  for (const doc of documents) {
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(doc.body.trim()),
        ),
      ),
    )
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
    const duplicate = seen.has(hash);
    seen.add(hash);
    result.push({ ...doc, hash, duplicate });
  }
  return result;
}
