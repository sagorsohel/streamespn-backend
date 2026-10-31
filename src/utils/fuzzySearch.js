/**
 * High-performance Precise Typo-Tolerance and Fuzzy Search Utility for Backend
 * Guarantees that only accurate and relevant matches are returned even with misspelled search queries.
 * (e.g. "cerlos" -> "Carlos Alcaraz", eliminating false positives like "Cerro" or "Certosa")
 */

function soundex(s) {
  if (!s) return '';
  const clean = s.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return '';
  const firstLetter = clean[0];
  const codes = {
    b: 1, f: 1, p: 1, v: 1,
    c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2,
    d: 3, t: 3,
    l: 4,
    m: 5, n: 5,
    r: 6,
  };
  const result = [firstLetter.toUpperCase()];
  let prevCode = codes[firstLetter] || 0;
  for (let i = 1; i < clean.length; i++) {
    const curCode = codes[clean[i]];
    if (curCode !== undefined) {
      if (curCode !== prevCode) {
        result.push(curCode);
      }
      prevCode = curCode;
    } else {
      prevCode = 0;
    }
    if (result.length === 4) break;
  }
  while (result.length < 4) result.push(0);
  return result.join('');
}

function levenshteinDistance(s1, s2) {
  const a = s1.toLowerCase();
  const b = s2.toLowerCase();
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const d = [];
  for (let i = 0; i <= a.length; i++) d[i] = [i];
  for (let j = 0; j <= b.length; j++) d[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,       // deletion
        d[i][j - 1] + 1,       // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return d[a.length][b.length];
}

function wordSimilarity(qWord, targetWord) {
  const qW = qWord.toLowerCase();
  const tW = targetWord.toLowerCase();

  if (qW === tW) return 100;
  const maxLen = Math.max(qW.length, tW.length);
  if (maxLen === 0) return 100;

  // Exact substring inside target word (e.g. "alcar" inside "alcaraz")
  if (tW.includes(qW)) {
    return 90 + (qW.length / tW.length) * 10;
  }

  // Reject if length difference is too large for a typo
  if (Math.abs(qW.length - tW.length) > 1) return 0;

  const dist = levenshteinDistance(qW, tW);
  const sndxQ = soundex(qW);
  const sndxT = soundex(tW);

  // Strict typo rules to prevent false-positives:
  // Words <= 6 characters: max 1 edit (e.g. cerlos -> carlos)
  // Words >= 7 characters: max 2 edits (e.g. dimitriv -> dimitrov)
  const maxAllowedDist = qW.length <= 6 ? 1 : 2;
  if (dist > maxAllowedDist) return 0;

  const ratio = 1 - dist / maxLen;
  if (ratio < 0.70) return 0;

  let score = ratio * 80;
  if (qW[0] === tW[0]) score += 10;
  if (sndxQ === sndxT) score += 10;

  return Math.min(score, 98);
}

function computeMatchScore(match, query) {
  const qClean = query.toLowerCase().trim();
  if (!qClean) return 0;

  const qNorm = qClean.replace(/[\s\-_]+/g, '');
  const qWords = qClean.split(/[\s\-_]+/).filter(Boolean);

  const home = (match.homeTeam || match.home_team || '').toLowerCase();
  const away = (match.awayTeam || match.away_team || '').toLowerCase();
  const title = (match.title || '').toLowerCase();
  const sub = (match.subcategoryName || match.sub_name || '').toLowerCase();
  const cat = (match.categoryName || match.cat_name || '').toLowerCase();

  const fullText = `${home} ${away} ${title} ${sub} ${cat}`.trim();
  const fullNorm = fullText.replace(/[\s\-_]+/g, '');

  // 1. Exact phrase substring match
  if (fullText.includes(qClean)) {
    return 1000 + (qClean.length / fullText.length) * 100;
  }

  // 1b. Normalized match (ignores spaces/hyphens)
  if (fullNorm.includes(qNorm)) {
    return 950;
  }

  // 2. All query words exist as substrings
  if (qWords.length > 1 && qWords.every((w) => fullText.includes(w))) {
    return 800;
  }

  // 3. Typo-tolerant word-by-word comparison
  const textWords = fullText.split(/[\s\-_,.:;()\/]+/).filter((w) => w.length >= 2);
  let totalScore = 0;
  let allMatched = true;

  for (const qW of qWords) {
    let bestWordScore = 0;
    for (const tW of textWords) {
      const sc = wordSimilarity(qW, tW);
      if (sc > bestWordScore) {
        bestWordScore = sc;
        if (bestWordScore >= 95) break;
      }
    }

    if (bestWordScore >= 70) {
      totalScore += bestWordScore;
    } else {
      allMatched = false;
    }
  }

  if (!allMatched) return 0;
  return totalScore / qWords.length;
}

function getGrams(word) {
  const w = word.toLowerCase().trim();
  const gramLen = w.length <= 4 ? 2 : 3;
  const grams = new Set();
  for (let i = 0; i <= w.length - gramLen; i++) {
    grams.add(w.substring(i, i + gramLen));
  }
  return Array.from(grams);
}

function fuzzyFilterAndRank(matches, query) {
  if (!query || !query.trim()) return matches;
  const scored = [];
  for (const m of matches) {
    const sc = computeMatchScore(m, query);
    if (sc >= 70) {
      scored.push({ match: m, score: sc });
    }
  }

  if (scored.length === 0) return [];

  // Sort by score descending first
  scored.sort((a, b) => b.score - a.score);

  // Confidence gap filtering:
  // If top match has a high score (>= 80), only keep close high-confidence matches (topScore - 12)
  // This eliminates unrelated random matches (e.g. Cerro when searching Carlos)
  const topScore = scored[0].score;
  const cutoff = topScore >= 80 ? Math.max(70, topScore - 12) : 70;
  const filtered = scored.filter((s) => s.score >= cutoff);

  const now = Date.now();
  const statusPriority = { live: 1, upcoming: 2, finished: 3 };

  filtered.sort((a, b) => {
    // 1. Clear score difference (>5 points)
    if (Math.abs(b.score - a.score) > 5) {
      return b.score - a.score;
    }
    // 2. Match status priority (live > upcoming > finished)
    const pA = statusPriority[a.match.status] || 4;
    const pB = statusPriority[b.match.status] || 4;
    if (pA !== pB) return pA - pB;

    // 3. Featured / customized match priority
    const custA = (a.match.isCustomized || a.match.is_customized) ? 1 : 0;
    const custB = (b.match.isCustomized || b.match.is_customized) ? 1 : 0;
    if (custA !== custB) return custB - custA;

    // 4. Closer match time to now
    const timeA = a.match.matchTime ? new Date(a.match.matchTime).getTime() : 0;
    const timeB = b.match.matchTime ? new Date(b.match.matchTime).getTime() : 0;
    return Math.abs(timeA - now) - Math.abs(timeB - now);
  });

  return filtered.map((s) => s.match);
}

module.exports = {
  soundex,
  levenshteinDistance,
  wordSimilarity,
  computeMatchScore,
  getGrams,
  fuzzyFilterAndRank,
};
