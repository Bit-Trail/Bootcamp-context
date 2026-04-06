const { randomUUID } = require("crypto");
const { nowIso } = require("./time");

function newId() {
  if (typeof randomUUID === "function") return randomUUID();
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function createInMemoryStore() {
  const documents = new Map(); // id -> current document
  const conversations = new Map(); // id -> conversation

  function createDocument({ title, content, tags }) {
    const id = newId();
    const createdAt = nowIso();
    const updatedAt = createdAt;
    const version = 1;

    const doc = {
      id,
      title,
      content,
      tags,
      version,
      createdAt,
      updatedAt,
      history: [
        {
          version,
          title,
          content,
          tags,
          updatedAt
        }
      ]
    };

    documents.set(id, doc);
    return doc;
  }

  function getDocument(id) {
    return documents.get(id) || null;
  }

  function getDocumentHistory(id) {
    const doc = documents.get(id);
    if (!doc) return null;
    const versions = [...doc.history].sort((a, b) => a.version - b.version);
    return { versions };
  }

  function updateDocument(id, { title, content, tags }) {
    const doc = documents.get(id);
    if (!doc) return null;

    doc.title = title;
    doc.content = content;
    doc.tags = tags;
    doc.version += 1;
    doc.updatedAt = nowIso();

    doc.history.push({
      version: doc.version,
      title,
      content,
      tags,
      updatedAt: doc.updatedAt
    });

    return doc;
  }

  function createConversation({ name }) {
    const id = newId();
    const conversation = {
      id,
      name,
      messages: []
    };
    conversations.set(id, conversation);
    return conversation;
  }

  function getConversation(id) {
    return conversations.get(id) || null;
  }

  function addMessage(conversationId, message) {
    const conv = conversations.get(conversationId);
    if (!conv) return null;
    conv.messages.push(message);
    return conv;
  }

  function listDocuments() {
    return [...documents.values()];
  }

  return {
    createDocument,
    getDocument,
    getDocumentHistory,
    updateDocument,
    createConversation,
    getConversation,
    addMessage,
    listDocuments,
    newMessageId: newId
  };
}

module.exports = { createInMemoryStore };

