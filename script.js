// script.js — case digest generation + shared digests (Firebase Firestore)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    deleteDoc,
    doc,
    updateDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ------------------------------------------------------------------ */
/* Firebase setup                                                      */
/* ------------------------------------------------------------------ */
const firebaseConfig = {
    apiKey: "AIzaSyAhLv7VZT6LSSZg_LL3oSK60BEsqfSJr-Q",
    authDomain: "case-1a0d5.firebaseapp.com",
    projectId: "case-1a0d5",
    storageBucket: "case-1a0d5.firebasestorage.app",
    messagingSenderId: "395262673226",
    appId: "1:395262673226:web:32affea4284fc2109601b3",
    measurementId: "G-B062MQKENP"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const digestsCol = collection(db, 'digests');

const GEMINI_MODEL = 'gemini-3.8-flash';  // best quality — see MODELS array in generateDigest()

/* Default Gemini API key — users don't need to enter one. */
const DEFAULT_GEMINI_KEY = 'AQ.Ab8RN6K7BrhTJsWyBEnWN46QQ3OjmpA7lbZ3Z9RTyzanSef-7Q';

/* ------------------------------------------------------------------ */
/* Loading screen                                                      */
/* ------------------------------------------------------------------ */
const loadingScreen = document.getElementById('loadingScreen');
const loadingStartedAt = performance.now();

function hideLoadingScreen() {
    const minimumDisplayTime = 900;
    const remainingDisplayTime = Math.max(0, minimumDisplayTime - (performance.now() - loadingStartedAt));
    window.setTimeout(() => {
        if (!loadingScreen) return;
        loadingScreen.classList.add('is-hidden');
        window.setTimeout(() => loadingScreen.remove(), 700);
    }, remainingDisplayTime);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hideLoadingScreen, { once: true });
} else {
    hideLoadingScreen();
}

/* ------------------------------------------------------------------ */
/* DOM elements                                                        */
/* ------------------------------------------------------------------ */
const lawphilRef = document.getElementById('lawphilRef');
const caseTextArea = document.getElementById('caseText');
const geminiKeyInput = document.getElementById('geminiKey');
const restoreKeyBtn = document.getElementById('restoreKeyBtn');
const digestBtn = document.getElementById('digestBtn');
const saveBtn = document.getElementById('saveBtn');
const downloadPdfBtn = document.getElementById('downloadPdfBtn'); // 👈 ADD
const clearBtn = document.getElementById('clearBtn');
const statusMsg = document.getElementById('statusMsg');
const digestOutput = document.getElementById('digestOutput');
const errorContainer = document.getElementById('errorContainer');
const savedList = document.getElementById('savedList');
const savedCount = document.getElementById('savedCount');
const clearSavedBtn = document.getElementById('clearSavedBtn');

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */
let currentDigest = null;   // { title, sections } — the digest on screen
let activeSavedId = null;   // Firestore doc id currently displayed
let savedDigests = [];      // in-memory mirror of the Firestore collection
let cloudReady = false;     // true after first snapshot arrives

/* ------------------------------------------------------------------ */
/* Status helpers                                                      */
/* ------------------------------------------------------------------ */
function setStatus(message, type = 'ready') {
    let icon = '<span class="w-2.5 h-2.5 rounded-full bg-mint-400 animate-dot-pulse flex-shrink-0"></span>';

    if (type === 'loading') {
        icon = '<span class="inline-block w-4 h-4 border-[2.5px] border-blush-200 border-t-blush-500 rounded-full animate-spin-slow flex-shrink-0"></span>';
    } else if (type === 'error') {
        icon = `<svg class="w-4 h-4 text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>`;
    } else if (type === 'success') {
        icon = `<svg class="w-4 h-4 text-blush-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>`;
    } else if (type === 'warn') {
        icon = `<svg class="w-4 h-4 text-orange-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>`;
    }

    statusMsg.innerHTML = `${icon} <span>${message}</span>`;
}

function clearError() {
    errorContainer.innerHTML = '';
}

function showError(message) {
    errorContainer.innerHTML = `
        <div class="animate-shake bg-gradient-to-br from-red-100 to-pink-100 border-l-[6px] border-red-400 text-red-800 px-5 py-4 rounded-2xl my-4 font-semibold text-sm shadow-sm flex items-start gap-2">
            <svg class="w-5 h-5 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>${message}</span>
        </div>
    `;
    errorContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ------------------------------------------------------------------ */
/* Empty states / reset                                                */
/* ------------------------------------------------------------------ */
function emptyDigestMarkup() {
    return `
        <div class="text-center py-10 sm:py-12">
            <svg class="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 text-blush-300 animate-bobble" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
                <line x1="9" y1="11" x2="15" y2="11"/>
            </svg>
            <div class="font-bold text-slate-600 text-base sm:text-lg mb-1">Your case digest will appear here</div>
            <div class="text-xs sm:text-sm text-slate-400 tracking-wide">Facts · Issue · Ruling · Lesson Learned</div>
        </div>
    `;
}

function resetDigestDisplay() {
    digestOutput.innerHTML = emptyDigestMarkup();
}
function updateSaveButton() {
    if (saveBtn) saveBtn.disabled = !currentDigest || !cloudReady;
    if (downloadPdfBtn) downloadPdfBtn.disabled = !currentDigest;
}

function clearAll() {
    clearError();
    resetDigestDisplay();
    setStatus('Ready when you are', 'ready');
    digestBtn.disabled = false;
    lawphilRef.value = '';
    caseTextArea.value = '';
    geminiKeyInput.value = DEFAULT_GEMINI_KEY;
    currentDigest = null;
    activeSavedId = null;
    updateSaveButton();
}
/* ------------------------------------------------------------------ */
/* PDF export (jsPDF)                                                  */
/* ------------------------------------------------------------------ */
function stripMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/\*([^*\n]+)\*/g, '$1')
        .replace(/(?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function downloadDigestPDF() {
    if (!currentDigest) {
        showError('Generate a digest first, then download it as PDF.');
        return;
    }

    const lib = window.jspdf;
    if (!lib || !lib.jsPDF) {
        showError('PDF library is still loading. Please try again in a moment.');
        return;
    }
    const { jsPDF } = lib;

    try {
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 56;
        const contentWidth = pageWidth - margin * 2;
        const lineHeight = 15;
        let cursorY = margin;

        const ensureSpace = (needed) => {
            if (cursorY + needed > pageHeight - margin) {
                doc.addPage();
                cursorY = margin;
            }
        };

        /* Header */
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(200, 30, 90);
        doc.text('CASE DIGEST', margin, cursorY);
        cursorY += 14;

        doc.setDrawColor(255, 200, 220);
        doc.setLineWidth(1);
        doc.line(margin, cursorY, pageWidth - margin, cursorY);
        cursorY += 26;

        /* Title */
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(25, 25, 35);
        const titleLines = doc.splitTextToSize(
            currentDigest.title || 'Untitled Case Digest',
            contentWidth
        );
        titleLines.forEach(line => {
            ensureSpace(24);
            doc.text(line, margin, cursorY);
            cursorY += 22;
        });

        cursorY += 6;
        doc.setDrawColor(255, 200, 220);
        doc.line(margin, cursorY, pageWidth - margin, cursorY);
        cursorY += 24;

        /* Sections */
        const sections = [
            { label: 'FACTS',           text: currentDigest.sections.facts,  color: [237, 28, 108] },
            { label: 'ISSUE',           text: currentDigest.sections.issue,  color: [147, 51, 234] },
            { label: 'RULING',          text: currentDigest.sections.ruling, color: [13, 148, 136] },
            { label: 'LESSON LEARNED',  text: currentDigest.sections.lesson, color: [234, 88, 12]  },
        ];

        sections.forEach((s, idx) => {
            ensureSpace(50);

            /* Accent bar + colored label */
            const [r, g, b] = s.color;
            doc.setFillColor(r, g, b);
            doc.rect(margin, cursorY - 10, 4, 13, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(r, g, b);
            doc.text(s.label, margin + 12, cursorY);
            cursorY += 20;

            /* Body — split into paragraphs to preserve structure */
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10.5);
            doc.setTextColor(45, 45, 55);

            const plain = stripMarkdown(s.text || 'Not available.');
            const paragraphs = plain.split(/\n+/).map(p => p.trim()).filter(Boolean);
            if (paragraphs.length === 0) paragraphs.push('Not available.');

            paragraphs.forEach(para => {
                const lines = doc.splitTextToSize(para, contentWidth);
                lines.forEach(line => {
                    ensureSpace(lineHeight);
                    doc.text(line, margin, cursorY);
                    cursorY += lineHeight;
                });
                cursorY += 4;
            });

            cursorY += 14;
        });

        /* Footer on every page */
        const total = doc.getNumberOfPages();
        for (let p = 1; p <= total; p++) {
            doc.setPage(p);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 160);
            doc.text(
                `Case Digest  ·  Page ${p} of ${total}`,
                pageWidth / 2,
                pageHeight - 22,
                { align: 'center' }
            );
        }

        /* Filename */
        const safeTitle = (currentDigest.title || 'case-digest')
            .replace(/[^a-z0-9\-_ ]/gi, '')
            .trim()
            .replace(/\s+/g, '_')
            .slice(0, 70) || 'case-digest';

        doc.save(`${safeTitle}.pdf`);
        setStatus(`PDF downloaded — ${safeTitle}.pdf`, 'success');
    } catch (err) {
        console.error('PDF generation error:', err);
        showError(`Could not generate PDF: ${err.message}`);
        setStatus('PDF generation failed', 'error');
    }
}
/* ------------------------------------------------------------------ */
/* Gemini call — rubric-tuned prompt + multi-model fallback             */
/* ------------------------------------------------------------------ */
async function generateDigest(caseText, apiKey) {
    if (!caseText || caseText.trim().length < 50) {
        throw new Error('Please paste a longer case text (at least 50 characters).');
    }
    
    const prompt = `You are an expert Philippine legal analyst and law professor. Your task is to produce a MODEL CASE DIGEST that would score a PERFECT 15/15 on ALL FOUR criteria of the PUP Legal Office Management case digest rubric.

═══════════════════════════════════════════════════════
THE FOUR RUBRIC CRITERIA — ALL MUST HIT "EXCELLENT WORK" (15/15)
═══════════════════════════════════════════════════════

[1] RELEVANCE OF ANSWER TO THE QUESTION (15/15)
    - Answer is complete; sufficient detail is provided to support every assertion.
    - Focuses ONLY on issues related to the question — introduce NO unrelated content.
    - Every statement must be factually correct and directly traceable to the case text.

[2] THOROUGHNESS OF ANSWER (15/15)
    - Deals fully with the entire question.
    - Include ALL essential details; leave no gaps in the narrative chain.

[3] ORGANIZATION, BASIS AND LOGIC OF ANSWER (15/15)
    - Clear and logical presentation; well-developed argument.
    - Transitions between ideas must be smooth and explicit.
    - Every conclusion must be supported by a SOURCE or BASIS drawn from the case (cite the ponente, the specific Article of the Civil Code/Constitution/Rules of Court, or the doctrinal principle invoked).

[4] MECHANICS OF WRITING (15/15)
    - Clear, readable, formal legal prose.
    - Strong transitions; no spelling, punctuation, or grammar errors.
    - No awkward sentence constructions.

═══════════════════════════════════════════════════════
REQUIRED OUTPUT — EXACTLY FIVE SECTIONS, IN THIS ORDER
═══════════════════════════════════════════════════════

**Title:** The short case name only, in "Surname v. Surname" form (e.g., "Gabriel v. Court of Appeals"). NO G.R. numbers, NO dates, NO docket numbers, NO "Philippines".

**Facts:** The complete factual and procedural narrative — the parties involved, what happened, the trial court proceedings, the appellate court proceedings, and how the case reached the Supreme Court. Include the specific acts or omissions that triggered the dispute. Use only facts stated in the case text — do not invent or speculate.

**Issue:** State the legal question(s) precisely. Use the form "Whether…" or "W/N…". If there are multiple issues, number them (1), (2), (3), etc. Frame each issue so it directly corresponds to the ruling.

**Ruling:** The Court's disposition and its reasoning. Cite the SPECIFIC legal basis — the applicable Article of the Civil Code/Revised Penal Code/Constitution/Rules of Court, the statute, or the doctrinal ruling invoked by the ponente. Explain HOW the Court arrived at its conclusion (the ratio decidendi), not merely what it concluded.

**Lesson Learned:** The practical takeaway or legal doctrine distilled from the case. State what a legal office practitioner or law student should remember and apply. Directly tie this to the ruling — do not introduce new doctrines not discussed in the case.

═══════════════════════════════════════════════════════
CASE TEXT
═══════════════════════════════════════════════════════
"""
${caseText}
"""

═══════════════════════════════════════════════════════
FORMATTING RULES (STRICT — VIOLATIONS WILL BE PENALIZED)
═══════════════════════════════════════════════════════
- Use **double asterisks** around key legal terms, party surnames, statutes, and doctrines to make them bold.
- Use *single asterisks* around Latin terms and case citations for italics.
- Do NOT use markdown headings (#), bullet symbols with hashes, or code blocks.
- Use plain, formal legal English with inline bold/italic only.
- Begin each section on its own line with the exact headings: "Title:", "Facts:", "Issue:", "Ruling:", "Lesson Learned:"
- Do not add any section other than the five required above.

Now produce the digest:`;
    
    /* ─── Try these models in order. If one is busy/down, fall to the next. */
    const MODELS = [
        'gemini-3.8-flash', // 🥇 Newest + smartest flash (best quality)
        'gemini-3.7-flash', // 🥈 Fast, reliable fallback
        'gemini-3.6-flash', // 🥉 Stable workhorse fallback
        'gemini-2.0-flash', // 🛟 Older but extremely stable
        'gemini-2.0-flash-lite', // 🛟 Ultra-fast emergency fallback
    ];
    
    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 }
    };
    
    let lastError = null;
    
    for (let m = 0; m < MODELS.length; m++) {
        const model = MODELS[m];
        setStatus(`Gemini is thinking… (using ${model})`, 'loading');
        
        // Up to 2 attempts per model
        for (let attempt = 1; attempt <= 2; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 90000);
            
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const errorMsg = errorData.error?.message || `Gemini API error (${response.status})`;
                    
                    // Overload / rate-limit / demand spike → retry or fallback
                    const isOverload =
                        response.status === 503 ||
                        response.status === 429 ||
                        /high demand|overloaded|unavailable|try again later|resource.?exhausted/i.test(errorMsg);
                    
                    if (isOverload) {
                        lastError = new Error(errorMsg);
                        await new Promise(r => setTimeout(r, 1500 * attempt));
                        continue; // retry same model, or move on if attempts done
                    }
                    
                    // Non-overload error → throw immediately
                    throw new Error(errorMsg);
                }
                
                const data = await response.json();
                const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!generatedText) throw new Error('Gemini returned an empty response.');
                return generatedText;
                
            } catch (err) {
                clearTimeout(timeoutId);
                
                if (err.name === 'AbortError') {
                    lastError = new Error(`Model ${model} timed out.`);
                    continue;
                }
                if (err.message.includes('API key not valid')) {
                    throw new Error('Invalid Gemini API key. Please check the key you entered.');
                }
                if (/not found|not supported|does not exist/i.test(err.message)) {
                    // Model name invalid for this API version → skip to next model
                    lastError = err;
                    break;
                }
                // Other errors → retry once
                lastError = err;
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    }
    
    // All models + retries exhausted
    const msg = lastError?.message || '';
    if (/high demand|overloaded|unavailable|resource.?exhausted/i.test(msg)) {
        throw new Error('All Gemini models are busy right now. Please wait a minute and try again.');
    }
    throw new Error(msg || 'Gemini could not generate a digest. Please try again.');
}


/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */
function parseDigestSections(rawText) {
    const sections = {
        title: '',
        facts: 'Not available.',
        issue: 'Not available.',
        ruling: 'Not available.',
        lesson: 'Not available.'
    };

    const lines = rawText.split(/\r?\n/);
    let currentSection = null;
    let buffer = [];

    const sectionKeywords = {
        'title': 'title',
        'case title': 'title',
        'facts': 'facts',
        'issue': 'issue',
        'ruling': 'ruling',
        'lesson learned': 'lesson',
        'lesson': 'lesson'
    };

    for (let line of lines) {
        const trimmed = line.trim();
        let matchedSection = null;

        for (let [keyword, sectionKey] of Object.entries(sectionKeywords)) {
            const regex = new RegExp(`^\\**\\s*${keyword}\\s*\\**\\s*:?`, 'i');
            if (regex.test(trimmed)) {
                matchedSection = sectionKey;
                break;
            }
        }

        if (matchedSection) {
            if (currentSection && buffer.length > 0) {
                const content = buffer.join('\n').trim();
                if (content) sections[currentSection] = content;
            }
            currentSection = matchedSection;
            buffer = [];
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex !== -1 && colonIndex < trimmed.length - 1) {
                const afterColon = trimmed.substring(colonIndex + 1).trim();
                if (afterColon) buffer.push(afterColon);
            }
        } else {
            if (currentSection) buffer.push(trimmed);
        }
    }

    if (currentSection && buffer.length > 0) {
        const content = buffer.join('\n').trim();
        if (content) sections[currentSection] = content;
    }

    sections.title = cleanTitle(sections.title);
    return sections;
}

function cleanTitle(raw) {
    let t = (raw || '').toString().trim();
    t = t.replace(/^\*+|\*+$/g, '').replace(/^_+|_+$/g, '');
    t = t.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
    t = t.replace(/\s+/g, ' ').trim();
    t = t.replace(/[.;,\s]+$/, '');
    return t;
}

function deriveTitleFromCaseText(text) {
    if (!text) return '';
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const vsPattern = /(?:^|\s)(?:vs?\.?|versus)(?:\s|$)/i;

    for (const line of lines.slice(0, 15)) {
        let cleaned = line.replace(/\s+/g, ' ').trim();
        if (!vsPattern.test(cleaned)) continue;
        if (cleaned.length < 8 || cleaned.length > 200) continue;

        cleaned = cleaned
            .replace(/,\s*(petitioner|respondent|appellant|appellee|plaintiff|defendant|accused|complainant|oppositor)s?[,\s]*/gi, ' ')
            .replace(/(?:^|\s)(?:vs?\.?|versus)(?:\s|$)/i, ' v. ')
            .replace(/\s+/g, ' ')
            .replace(/[.;,\s]+$/, '')
            .trim();

        if (cleaned) return cleaned;
    }
    return '';
}

/* ------------------------------------------------------------------ */
/* Section icons                                                       */
/* ------------------------------------------------------------------ */
const SECTION_ICONS = {
    facts: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>`,
    issue: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>`,
    ruling: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3v18"/>
        <path d="M5 7l7-4 7 4"/>
        <path d="M5 7l-2 6a3 3 0 0 0 6 0L7 7"/>
        <path d="M19 7l-2 6a3 3 0 0 0 6 0l-2-6"/>
        <path d="M3 21h18"/>
    </svg>`,
    lesson: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
        <path d="M6 12v5c3 3 9 3 12 0v-5"/>
    </svg>`,
    bookmark: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    </svg>`
};

/* ------------------------------------------------------------------ */
/* Rendering the digest                                                */
/* ------------------------------------------------------------------ */
function renderDigest(sections, title) {
    const facts = sections.facts || 'Not available.';
    const issue = sections.issue || 'Not available.';
    const ruling = sections.ruling || 'Not available.';
    const lesson = sections.lesson || 'Not available.';

    const sectionData = [
        { iconKey: 'facts', title: 'Facts', content: facts, delay: '0.05s', accent: 'from-blush-400 to-blush-500', iconColor: 'text-blush-500' },
        { iconKey: 'issue', title: 'Issue', content: issue, delay: '0.15s', accent: 'from-lilac-400 to-lilac-500', iconColor: 'text-lilac-500' },
        { iconKey: 'ruling', title: 'Ruling', content: ruling, delay: '0.25s', accent: 'from-mint-400 to-mint-500', iconColor: 'text-mint-600' },
        { iconKey: 'lesson', title: 'Lesson Learned', content: lesson, delay: '0.35s', accent: 'from-orange-400 to-pink-400', iconColor: 'text-orange-500' },
    ];

    const header = title ? `
        <div class="flex items-start gap-3 mb-5 pb-5 border-b-2 border-dashed border-blush-100/70 animate-fade-up">
            <span class="mt-0.5 w-9 h-9 flex-shrink-0 grid place-items-center rounded-xl bg-gradient-to-br from-blush-100 to-lilac-100 text-blush-500">
                ${SECTION_ICONS.bookmark}
            </span>
            <div class="min-w-0">
                <p class="text-[10px] font-extrabold uppercase tracking-[1.5px] text-slate-400 mb-0.5">Case Title</p>
                <h2 class="text-base sm:text-lg font-extrabold text-slate-800 leading-snug break-words">
                    ${escapeHtml(title)}
                </h2>
            </div>
        </div>
    ` : '';

    digestOutput.innerHTML = header + sectionData.map(s => `
        <div class="mb-6 last:mb-0 pb-6 last:pb-0 border-b-2 border-dashed border-blush-100/70 last:border-none animate-fade-up" style="animation-delay:${s.delay};">
            <div class="flex items-center gap-2.5 mb-3">
                <span class="inline-block w-1.5 h-5 rounded-full bg-gradient-to-b ${s.accent}"></span>
                <span class="${s.iconColor}">${SECTION_ICONS[s.iconKey]}</span>
                <h3 class="text-xs sm:text-sm font-extrabold uppercase tracking-[1.5px] bg-gradient-to-r ${s.accent} bg-clip-text text-transparent">
                    ${s.title}
                </h3>
            </div>
            <div class="text-sm sm:text-[15px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words bg-white rounded-2xl px-4 py-3.5 border-2 border-blush-100/70 shadow-sm">
                     ${formatText(s.content)}
            </div>
        </div>
    `).join('');
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatText(text) {
    if (!text) return '';

    let html = escapeHtml(text);

    html = html.replace(/\*\*([^*]+)\*\*/g,
        '<strong class="font-bold text-slate-900">$1</strong>');

    html = html.replace(/__([^_]+)__/g,
        '<strong class="font-bold text-slate-900">$1</strong>');

    html = html.replace(/\*([^*\n]+)\*/g,
        '<em class="italic text-slate-700">$1</em>');

    html = html.replace(/(?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])/g,
        '<em class="italic text-slate-700">$1</em>');

    return html;
}

/* ------------------------------------------------------------------ */
/* Firestore sync (live)                                               */
/* ------------------------------------------------------------------ */
function subscribeToSavedDigests() {
    const q = query(digestsCol, orderBy('savedAt', 'desc'));

    onSnapshot(q,
        (snapshot) => {
            savedDigests = snapshot.docs.map(docSnap => {
                const data = docSnap.data() || {};
                return {
                    id: docSnap.id,
                    title: data.title || 'Untitled Case Digest',
                    sections: data.sections || {},
                    savedAt: data.savedAt && typeof data.savedAt.toDate === 'function'
                        ? data.savedAt.toDate().getTime()
                        : (data.savedAt || Date.now())
                };
            });

            cloudReady = true;
            renderSavedList();
            updateSaveButton();

            if (!activeSavedId && !currentDigest) {
                setStatus('Ready when you are — saved digests are shared with everyone', 'ready');
            }
        },
        (error) => {
            console.error('Firestore subscription error:', error);
            cloudReady = false;
            updateSaveButton();
            showError('Could not connect to the shared digest database. Check your Firestore rules and network.');
            setStatus('Cloud sync offline', 'error');
        }
    );
}

/* ------------------------------------------------------------------ */
/* Saved digests — rendering                                           */
/* ------------------------------------------------------------------ */
const ICON_OPEN = `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
</svg>`;
const ICON_EDIT = `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
</svg>`;
const ICON_TRASH = `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
</svg>`;
const ICON_CALENDAR = `<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
</svg>`;

function formatDate(timestamp) {
    try {
        return new Date(timestamp).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    } catch (err) {
        return '';
    }
}

function renderSavedList() {
    if (!savedList) return;

    if (savedCount) savedCount.textContent = String(savedDigests.length);
    if (clearSavedBtn) clearSavedBtn.disabled = savedDigests.length === 0 || !cloudReady;

    if (!cloudReady) {
        savedList.innerHTML = `
            <div class="sm:col-span-2 rounded-2xl border-2 border-dashed border-blush-100 bg-white/60 px-5 py-8 text-center">
                <span class="inline-block w-6 h-6 border-[2.5px] border-blush-200 border-t-blush-500 rounded-full animate-spin-slow mb-2"></span>
                <p class="text-sm font-semibold text-slate-500">Connecting to the shared digest database…</p>
            </div>
        `;
        return;
    }

    if (!savedDigests.length) {
        savedList.innerHTML = `
            <div class="sm:col-span-2 rounded-2xl border-2 border-dashed border-blush-100 bg-white/60 px-5 py-8 text-center">
                <svg class="w-8 h-8 mx-auto mb-2 text-blush-200 animate-bobble" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
                <p class="text-sm font-semibold text-slate-500">No saved digests yet</p>
                <p class="text-xs text-slate-400 mt-1">
                    Generate a digest, then tap <strong class="text-mint-600 font-bold">Save Digest</strong> — everyone will see it here.
                </p>
            </div>
        `;
        return;
    }

    savedList.innerHTML = savedDigests.map(item => `
        <article class="group relative flex items-start gap-2 rounded-2xl border-2 border-blush-100 bg-white/90 p-3.5 transition-all duration-300 hover:border-mint-300 hover:shadow-[0_10px_25px_-12px_rgba(20,184,166,0.45)] hover:-translate-y-0.5 animate-fade-up">
            <button type="button" data-action="open" data-id="${escapeHtml(item.id)}"
                    class="flex-1 min-w-0 text-left rounded-xl px-1 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint-300">
                <h3 class="font-bold text-slate-800 text-sm leading-snug break-words group-hover:text-mint-700 transition-colors duration-200">
                    ${escapeHtml(item.title || 'Untitled Case Digest')}
                </h3>
                <p class="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1.5">
                    <span class="text-mint-500">${ICON_CALENDAR}</span>
                    <span>${escapeHtml(formatDate(item.savedAt))}</span>
                </p>
            </button>
            <div class="flex flex-col gap-1 flex-shrink-0">
                <button type="button" data-action="rename" data-id="${escapeHtml(item.id)}"
                        title="Rename" aria-label="Rename digest"
                        class="w-7 h-7 grid place-items-center rounded-lg text-slate-400 hover:text-lilac-600 hover:bg-lilac-50 transition-colors duration-200">
                    ${ICON_EDIT}
                </button>
                <button type="button" data-action="delete" data-id="${escapeHtml(item.id)}"
                        title="Delete" aria-label="Delete digest"
                        class="w-7 h-7 grid place-items-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors duration-200">
                    ${ICON_TRASH}
                </button>
            </div>
        </article>
    `).join('');
}

/* ------------------------------------------------------------------ */
/* Saved digests — actions (Firestore)                                 */
/* ------------------------------------------------------------------ */
async function handleSaveDigest() {
    if (!currentDigest) {
        showError('Generate a digest first, then save it.');
        return;
    }
    if (!cloudReady) {
        showError('Still connecting to the shared database. Please wait a moment and try again.');
        return;
    }

    const title = cleanTitle(currentDigest.title) || 'Untitled Case Digest';

    const duplicate = savedDigests.find(
        d => (d.title || '').toLowerCase() === title.toLowerCase()
    );

    if (duplicate) {
        const ok = window.confirm(`A shared digest titled "${duplicate.title}" already exists.\n\nOverwrite it for everyone?`);
        if (!ok) return;

        try {
            await updateDoc(doc(db, 'digests', duplicate.id), {
                title,
                sections: currentDigest.sections,
                savedAt: serverTimestamp()
            });
            activeSavedId = duplicate.id;
            setStatus(`Updated “${title}” for everyone`, 'success');
        } catch (err) {
            console.error(err);
            showError(`Could not update digest: ${err.message}`);
            setStatus('Save failed', 'error');
        }
        return;
    }

    try {
        const ref = await addDoc(digestsCol, {
            title,
            sections: currentDigest.sections,
            savedAt: serverTimestamp()
        });
        activeSavedId = ref.id;
        setStatus(`Saved “${title}” — visible to everyone`, 'success');
    } catch (err) {
        console.error(err);
        showError(`Could not save to the shared database: ${err.message}`);
        setStatus('Save failed', 'error');
    }
}

function openSavedDigest(id) {
    const item = savedDigests.find(d => d.id === id);
    if (!item) return;

    currentDigest = { title: item.title, sections: item.sections };
    activeSavedId = id;
    updateSaveButton();
    renderDigest(item.sections, item.title);
    setStatus(`Loaded “${item.title}”`, 'success');
    digestOutput.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function renameSavedDigest(id) {
    const item = savedDigests.find(d => d.id === id);
    if (!item) return;

    const next = window.prompt('Rename this digest (visible to everyone):', item.title || '');
    if (next === null) return;

    const clean = cleanTitle(next);
    if (!clean) {
        setStatus('Title cannot be empty', 'warn');
        return;
    }

    try {
        await updateDoc(doc(db, 'digests', id), { title: clean });

        if (activeSavedId === id && currentDigest) {
            currentDigest.title = clean;
            renderDigest(currentDigest.sections, clean);
        }
        setStatus(`Renamed to “${clean}”`, 'success');
    } catch (err) {
        console.error(err);
        showError(`Could not rename: ${err.message}`);
    }
}

async function deleteSavedDigest(id) {
    const item = savedDigests.find(d => d.id === id);
    if (!item) return;
    if (!window.confirm(`Delete “${item.title || 'Untitled Case Digest'}” for everyone?`)) return;

    try {
        await deleteDoc(doc(db, 'digests', id));
        if (activeSavedId === id) activeSavedId = null;
        setStatus('Digest deleted for everyone', 'ready');
    } catch (err) {
        console.error(err);
        showError(`Could not delete: ${err.message}`);
    }
}

async function clearAllSavedDigests() {
    if (!savedDigests.length) return;
    if (!window.confirm(`Delete all ${savedDigests.length} shared digest(s) for everyone? This cannot be undone.`)) return;

    setStatus('Deleting all shared digests…', 'loading');

    try {
        await Promise.all(savedDigests.map(d => deleteDoc(doc(db, 'digests', d.id))));
        activeSavedId = null;
        setStatus('All shared digests cleared', 'ready');
    } catch (err) {
        console.error(err);
        showError(`Could not clear all: ${err.message}`);
        setStatus('Clear failed', 'error');
    }
}

/* ------------------------------------------------------------------ */
/* Main generate handler                                               */
/* ------------------------------------------------------------------ */
async function handleGenerateDigest() {
    clearError();
    resetDigestDisplay();
    digestBtn.disabled = true;

    const caseText = caseTextArea.value.trim();
    const apiKey = (geminiKeyInput.value.trim() || DEFAULT_GEMINI_KEY);

    if (!caseText) {
        showError('Please paste the case text in the case text area.');
        setStatus('Missing case text', 'warn');
        digestBtn.disabled = false;
        return;
    }

    if (!apiKey) {
        showError('No Gemini API key available. Please enter one.');
        setStatus('Missing API key', 'warn');
        digestBtn.disabled = false;
        return;
    }

    currentDigest = null;
    activeSavedId = null;
    updateSaveButton();

    try {
        const digestRaw = await generateDigest(caseText, apiKey);
        const sections = parseDigestSections(digestRaw);

        const title = cleanTitle(sections.title) || deriveTitleFromCaseText(caseText) || 'Untitled Case Digest';
        sections.title = title;

        currentDigest = { title, sections };
        updateSaveButton();

        renderDigest(sections, title);
        setStatus('Digest generated — tap Save Digest to share it', 'success');
        digestOutput.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
        console.error(err);
        const errorMsg = err.message || 'An unexpected error occurred.';
        showError(errorMsg);
        setStatus('Generation failed', 'error');
    } finally {
        digestBtn.disabled = false;
    }
}

/* ------------------------------------------------------------------ */
/* Event listeners                                                     */
/* ------------------------------------------------------------------ */
clearBtn.addEventListener('click', () => {
    clearAll();
    caseTextArea.focus();
});

digestBtn.addEventListener('click', handleGenerateDigest);
saveBtn.addEventListener('click', handleSaveDigest);
downloadPdfBtn.addEventListener('click', downloadDigestPDF); // 👈 ADD

if (restoreKeyBtn) {
    restoreKeyBtn.addEventListener('click', () => {
        geminiKeyInput.value = DEFAULT_GEMINI_KEY;
        setStatus('Default API key restored ✨', 'success');
    });
}

if (savedList) {
    savedList.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-action]');
        if (!trigger || !savedList.contains(trigger)) return;

        const action = trigger.getAttribute('data-action');
        const id = trigger.getAttribute('data-id');
        if (!id) return;

        if (action === 'open') openSavedDigest(id);
        else if (action === 'rename') renameSavedDigest(id);
        else if (action === 'delete') deleteSavedDigest(id);
    });
}

if (clearSavedBtn) {
    clearSavedBtn.addEventListener('click', clearAllSavedDigests);
}

/* ------------------------------------------------------------------ */
/* Initial state                                                       */
/* ------------------------------------------------------------------ */
geminiKeyInput.value = DEFAULT_GEMINI_KEY;  // pre-fill the shared key

resetDigestDisplay();
renderSavedList();
updateSaveButton();
setStatus('Connecting to the shared digest database…', 'loading');
caseTextArea.focus();

subscribeToSavedDigests();
