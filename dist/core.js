(function (root) {
  'use strict';
  const EXAM = { questions: 30, milliseconds: 20 * 60 * 1000, maxErrors: 3 };
  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function eligible(questions, progress, chapters, mode) {
    const selected = new Set(chapters);
    return questions.filter(q => selected.has(q.chapterId) &&
      (mode === 'errors' ? progress[q.id]?.error === true : !progress[q.id]?.mastered));
  }
  function record(progress, question, answer, now = Date.now()) {
    const old = progress[question.id] || { mastered: false, error: false, attempts: 0, wrong: 0 };
    const correct = answer === question.answer;
    progress[question.id] = {
      mastered: old.mastered || correct, error: !correct,
      attempts: old.attempts + 1, wrong: old.wrong + (correct ? 0 : 1),
      lastAnswer: answer, updatedAt: now
    };
    return correct;
  }
  function chapterStats(questions, progress, chapterId) {
    const qs = questions.filter(q => q.chapterId === chapterId);
    return { total: qs.length, mastered: qs.filter(q => progress[q.id]?.mastered).length,
      errors: qs.filter(q => progress[q.id]?.error).length };
  }
  function examResult(questions, answers) {
    const wrong = questions.filter(q => answers[q.id] !== q.answer);
    return { errors: wrong.length, correct: questions.length - wrong.length,
      unanswered: questions.filter(q => typeof answers[q.id] !== 'boolean').length,
      passed: wrong.length <= EXAM.maxErrors, wrongIds: wrong.map(q => q.id) };
  }
  function validateBackup(data, questions) {
    if (!data || data.format !== 'patente-lab-progress' || data.version !== 1 ||
      typeof data.progress !== 'object' || Array.isArray(data.progress) || data.progress === null) {
      throw new Error('Questo file non è un backup di Patente Lab.');
    }
    const validIds = new Set(questions.map(q => q.id));
    const progress = {};
    for (const [id, p] of Object.entries(data.progress)) {
      if (!validIds.has(id) || !p || typeof p.mastered !== 'boolean' || typeof p.error !== 'boolean' ||
        !Number.isSafeInteger(p.attempts) || p.attempts < 0 || !Number.isSafeInteger(p.wrong) ||
        p.wrong < 0 || p.wrong > p.attempts || !Number.isFinite(p.updatedAt) || p.updatedAt < 0 ||
        (typeof p.lastAnswer !== 'boolean' && p.lastAnswer !== null)) {
        throw new Error('Il backup contiene dati non validi o appartiene a una banca dati diversa.');
      }
      progress[id] = { mastered:p.mastered, error:p.error, attempts:p.attempts,
        wrong:p.wrong, updatedAt:p.updatedAt, lastAnswer:p.lastAnswer };
    }
    return progress;
  }
  const api = { EXAM, shuffle, eligible, record, chapterStats, examResult, validateBackup };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PatenteCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
