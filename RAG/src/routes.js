const { nowIso } = require("./time");

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function validateTags(tags) {
  if (tags === undefined) return [];
  if (!Array.isArray(tags)) return null;
  for (const t of tags) {
    if (!isNonEmptyString(t)) return null;
  }
  return tags;
}

function validateTopK(topK) {
  if (topK === undefined) return 3;
  if (!Number.isInteger(topK)) return null;
  if (topK < 1 || topK > 10) return null;
  return topK;
}

function registerRoutes(app, store, retrieval) {
  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.post("/api/documents", (req, res) => {
    try {
      const { title, content, tags } = req.body || {};
      if (!isNonEmptyString(title) || !isNonEmptyString(content)) {
        return res.status(400).json({ error: "title and content are required non-empty strings." });
      }
      const parsedTags = validateTags(tags);
      if (parsedTags === null) {
        return res.status(400).json({ error: "tags must be an array of non-empty strings." });
      }

      const doc = store.createDocument({
        title,
        content,
        tags: parsedTags
      });
      return res.status(201).json(doc);
    } catch (e) {
      return res.status(500).json({ error: "Unexpected error." });
    }
  });

  app.get("/api/documents/:id", (req, res) => {
    const doc = store.getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found." });
    return res.status(200).json(doc);
  });

  app.get("/api/documents/:id/history", (req, res) => {
    const history = store.getDocumentHistory(req.params.id);
    if (!history) return res.status(404).json({ error: "Document not found." });
    return res.status(200).json(history);
  });

  app.put("/api/documents/:id", (req, res) => {
    const { title, content, tags } = req.body || {};
    if (!isNonEmptyString(title) || !isNonEmptyString(content)) {
      return res.status(400).json({ error: "title and content are required non-empty strings." });
    }
    const parsedTags = validateTags(tags);
    if (parsedTags === null) {
      return res.status(400).json({ error: "tags must be an array of non-empty strings." });
    }

    const updated = store.updateDocument(req.params.id, {
      title,
      content,
      tags: parsedTags
    });

    if (!updated) return res.status(404).json({ error: "Document not found." });
    return res.status(200).json(updated);
  });

  app.post("/api/search", (req, res) => {
    try {
      const { query, topK, tag } = req.body || {};
      if (!isNonEmptyString(query)) {
        return res.status(400).json({ error: "query is required non-empty string." });
      }
      const parsedTopK = validateTopK(topK);
      if (parsedTopK === null) return res.status(400).json({ error: "topK must be an integer from 1 to 10." });

      if (tag !== undefined && !isNonEmptyString(tag)) {
        return res.status(400).json({ error: "tag must be a non-empty string." });
      }
      const parsedTag = tag === undefined ? undefined : tag;

      const results = retrieval.rankDocuments({ query, topK: parsedTopK, tag: parsedTag });
      return res.status(200).json({ results });
    } catch (e) {
      if (e && e.status === 400) return res.status(400).json({ error: e.message });
      return res.status(500).json({ error: "Unexpected error." });
    }
  });

  app.post("/api/answers", (req, res) => {
    try {
      const { query, topK, tag } = req.body || {};
      if (!isNonEmptyString(query)) {
        return res.status(400).json({ error: "query is required non-empty string." });
      }
      const parsedTopK = validateTopK(topK);
      if (parsedTopK === null) return res.status(400).json({ error: "topK must be an integer from 1 to 10." });

      if (tag !== undefined && !isNonEmptyString(tag)) {
        return res.status(400).json({ error: "tag must be a non-empty string." });
      }
      const parsedTag = tag === undefined ? undefined : tag;

      const { answer, citations } = retrieval.buildAnswer({ query, topK: parsedTopK, tag: parsedTag });
      return res.status(200).json({ answer, citations });
    } catch (e) {
      if (e && e.status === 400) return res.status(400).json({ error: e.message });
      return res.status(500).json({ error: "Unexpected error." });
    }
  });

  app.post("/api/conversations", (req, res) => {
    const { name } = req.body || {};
    if (!isNonEmptyString(name)) return res.status(400).json({ error: "name is required non-empty string." });

    const conv = store.createConversation({ name });
    return res.status(201).json({
      id: conv.id,
      name: conv.name,
      messages: []
    });
  });

  app.post("/api/conversations/:id/messages", (req, res) => {
    try {
      const conv = store.getConversation(req.params.id);
      if (!conv) return res.status(404).json({ error: "Conversation not found." });

      const { query, topK, tag } = req.body || {};
      if (!isNonEmptyString(query)) return res.status(400).json({ error: "query is required non-empty string." });

      const parsedTopK = validateTopK(topK);
      if (parsedTopK === null) return res.status(400).json({ error: "topK must be an integer from 1 to 10." });

      if (tag !== undefined && !isNonEmptyString(tag)) {
        return res.status(400).json({ error: "tag must be a non-empty string." });
      }
      const parsedTag = tag === undefined ? undefined : tag;

      const userMessage = {
        id: store.newMessageId(),
        role: "user",
        content: query,
        createdAt: nowIso()
      };
      store.addMessage(conv.id, userMessage);

      const { answer, citations } = retrieval.buildAnswer({ query, topK: parsedTopK, tag: parsedTag });

      const assistantMessage = {
        id: store.newMessageId(),
        role: "assistant",
        content: answer,
        createdAt: nowIso(),
        citations
      };
      store.addMessage(conv.id, assistantMessage);

      return res.status(201).json({
        userMessage,
        assistantMessage,
        citations
      });
    } catch (e) {
      if (e && e.status === 400) return res.status(400).json({ error: e.message });
      return res.status(500).json({ error: "Unexpected error." });
    }
  });

  app.get("/api/conversations/:id", (req, res) => {
    const conv = store.getConversation(req.params.id);
    if (!conv) return res.status(404).json({ error: "Conversation not found." });
    return res.status(200).json({
      id: conv.id,
      name: conv.name,
      messages: conv.messages
    });
  });
}

module.exports = { registerRoutes };

