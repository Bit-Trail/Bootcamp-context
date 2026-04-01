function tokenizeLowerAlnum(text) {
  if (typeof text !== "string") return [];
  const matches = text.toLowerCase().match(/[a-z0-9]+/g);
  return matches ? matches : [];
}

function dedupePreserveOrder(arr) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function splitSegments(content) {
  // Split by newlines or sentence boundaries (". ", "!", "?") approximately.
  // The requirement calls out ". ", but we also split on punctuation followed by whitespace.
  return String(content).split(/(?:\r?\n+|[.!?](?:\s+|$))/).filter(s => s.length > 0);
}

function buildSnippet({ content, queryTokensSet, queryTokens }) {
  const segments = splitSegments(content);

  for (const seg of segments) {
    const segTokens = tokenizeLowerAlnum(seg);
    // "containing at least one query token"
    let hit = false;
    for (const t of segTokens) {
      if (queryTokensSet.has(t)) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;

    let snippet = seg.trim();
    if (snippet.length > 160) snippet = snippet.slice(0, 160).trim();
    return snippet;
  }

  let snippet = String(content).slice(0, 160).trim();
  if (snippet.length > 160) snippet = snippet.slice(0, 160);
  return snippet;
}

function computeScore({ docTitle, docContent, titleTokensSet, contentTokensSet, queryTokens, queryLower }) {
  // Token hits are counted as "how many unique query tokens exist" in the doc title/content.
  let titleTokenHits = 0;
  let contentTokenHits = 0;

  for (const qt of queryTokens) {
    if (titleTokensSet.has(qt)) titleTokenHits += 1;
    if (contentTokensSet.has(qt)) contentTokenHits += 1;
  }

  let score = 3 * titleTokenHits + 1 * contentTokenHits;

  if (docTitle.toLowerCase().includes(queryLower)) score += 2;
  if (docContent.toLowerCase().includes(queryLower)) score += 5;

  return score;
}

function sortResults(results) {
  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
    return a.documentId.localeCompare(b.documentId);
  });
}

function createRetrievalEngine(store) {
  function rankDocuments({ query, topK, tag }) {
    const qTokensRaw = tokenizeLowerAlnum(query);
    const qTokens = dedupePreserveOrder(qTokensRaw);

    if (qTokens.length === 0) {
      const err = new Error("Query tokenization produced zero tokens.");
      err.status = 400;
      throw err;
    }

    const queryLower = query.toLowerCase();
    const queryTokensSet = new Set(qTokens);

    const documents = store.listDocuments();

    const filtered = documents.filter(doc => {
      if (tag !== undefined) {
        // tag must match exact string presence in doc tags
        if (!Array.isArray(doc.tags) || !doc.tags.includes(tag)) return false;
      }
      const titleTokens = tokenizeLowerAlnum(doc.title);
      const contentTokens = tokenizeLowerAlnum(doc.content);
      const titleTokenSet = new Set(titleTokens);
      const contentTokenSet = new Set(contentTokens);

      const score = computeScore({
        docTitle: doc.title,
        docContent: doc.content,
        titleTokensSet: titleTokenSet,
        contentTokensSet: contentTokenSet,
        queryTokens: qTokens,
        queryLower
      });

      return score > 0;
    });

    const scored = filtered.map(doc => {
      const titleTokens = tokenizeLowerAlnum(doc.title);
      const contentTokens = tokenizeLowerAlnum(doc.content);
      const titleTokenSet = new Set(titleTokens);
      const contentTokenSet = new Set(contentTokens);

      const score = computeScore({
        docTitle: doc.title,
        docContent: doc.content,
        titleTokensSet: titleTokenSet,
        contentTokensSet: contentTokenSet,
        queryTokens: qTokens,
        queryLower
      });

      return {
        documentId: doc.id,
        title: doc.title,
        version: doc.version,
        score,
        snippet: buildSnippet({
          content: doc.content,
          queryTokensSet,
          queryTokens: qTokens
        }),
        createdAt: doc.createdAt // only used for sorting; removed before returning
      };
    });

    const sorted = sortResults(scored);
    return sorted.slice(0, topK).map(r => ({
      documentId: r.documentId,
      title: r.title,
      version: r.version,
      score: r.score,
      snippet: r.snippet
    }));
  }

  function buildAnswer({ query, topK, tag }) {
    const results = rankDocuments({ query, topK, tag });
    if (results.length === 0) {
      return {
        answer: "No relevant context found.",
        citations: []
      };
    }

    const lines = ["Relevant context:"];
    const citations = [];

    results.forEach((r, idx) => {
      const rank = idx + 1;
      lines.push(`[${rank}] ${r.snippet}`);
      citations.push({
        rank,
        documentId: r.documentId,
        score: r.score,
        snippet: r.snippet
      });
    });

    return {
      answer: lines.join("\n"),
      citations
    };
  }

  return {
    rankDocuments,
    buildAnswer
  };
}

module.exports = { createRetrievalEngine };

