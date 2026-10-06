// script.js — with SVG icons

(function() {
    // DOM elements
    const lawphilRef = document.getElementById('lawphilRef');
    const caseTextArea = document.getElementById('caseText');
    const geminiKeyInput = document.getElementById('geminiKey');
    const toggleKeyBtn = document.getElementById('toggleKey');
    const eyeOpen = document.getElementById('eyeOpen');
    const eyeClosed = document.getElementById('eyeClosed');
    const digestBtn = document.getElementById('digestBtn');
    const clearBtn = document.getElementById('clearBtn');
    const statusMsg = document.getElementById('statusMsg');
    const digestOutput = document.getElementById('digestOutput');
    const errorContainer = document.getElementById('errorContainer');

    // ---- start with no pre-filled API key ----
    geminiKeyInput.value = '';

    // ---- toggle API key visibility ----
    toggleKeyBtn.addEventListener('click', () => {
        const isPassword = geminiKeyInput.type === 'password';
        geminiKeyInput.type = isPassword ? 'text' : 'password';
        if (isPassword) {
            eyeOpen.classList.add('hidden');
            eyeClosed.classList.remove('hidden');
        } else {
            eyeOpen.classList.remove('hidden');
            eyeClosed.classList.add('hidden');
        }
        toggleKeyBtn.setAttribute('aria-label', isPassword ? 'Hide key' : 'Show key');
    });

    // ---- helper: show status ----
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

    // ---- clear error banner ----
    function clearError() {
        errorContainer.innerHTML = '';
    }

    // ---- display error ----
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

    // ---- clear digest output ----
    function resetDigestDisplay() {
        digestOutput.innerHTML = `
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

    // ---- reset everything ----
    function clearAll() {
        clearError();
        resetDigestDisplay();
        setStatus('Ready when you are', 'ready');
        digestBtn.disabled = false;
        lawphilRef.value = '';
        caseTextArea.value = '';
        geminiKeyInput.value = '';
        geminiKeyInput.type = 'password';
        eyeOpen.classList.remove('hidden');
        eyeClosed.classList.add('hidden');
    }

    // ---- call Gemini API ----
    async function generateDigest(caseText, apiKey) {
        if (!apiKey || apiKey.trim().length < 10) {
            throw new Error('Please enter a valid Gemini API key.');
        }

        if (!caseText || caseText.trim().length < 50) {
            throw new Error('Please paste a longer case text (at least 50 characters).');
        }

        const prompt = `You are a legal analyst. Based on the following Philippine Supreme Court case text, create a case digest with EXACTLY these four sections: **Facts**, **Issue**, **Ruling**, and **Lesson Learned**. 

Requirements:
- Be concise but comprehensive.
- Facts: summarize the relevant background and procedural history.
- Issue: state the legal question(s) clearly.
- Ruling: explain the court's decision and reasoning.
- Lesson Learned: provide a practical takeaway or legal doctrine.

Case text:
"""
${caseText}
"""

Return your answer in plain text with the headings "Facts:", "Issue:", "Ruling:", "Lesson Learned:" on separate lines. Do not add extra sections.`;

        setStatus('Gemini is thinking…', 'loading');

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
        const requestBody = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 2000 }
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMsg = errorData.error?.message || `Gemini API error (${response.status})`;
                throw new Error(errorMsg);
            }

            const data = await response.json();
            const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!generatedText) throw new Error('Gemini returned an empty response.');
            return generatedText;
        } catch (err) {
            if (err.message.includes('API key not valid')) {
                throw new Error('Invalid Gemini API key. Please check your key.');
            }
            if (err.message.includes('not found') || err.message.includes('not supported')) {
                throw new Error('Model gemini-3.6-flash is not available. Check the model name or your API access.');
            }
            throw err;
        }
    }

    // ---- parse digest sections ----
    function parseDigestSections(rawText) {
        const sections = {
            facts: 'Not available.',
            issue: 'Not available.',
            ruling: 'Not available.',
            lesson: 'Not available.'
        };

        const lines = rawText.split(/\r?\n/);
        let currentSection = null;
        let buffer = [];

        const sectionKeywords = {
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

        return sections;
    }

    // ---- SVG icon templates for digest sections ----
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
    };

    // ---- render digest with SVG icons ----
    function renderDigest(sections) {
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

        digestOutput.innerHTML = sectionData.map(s => `
            <div class="mb-6 last:mb-0 pb-6 last:pb-0 border-b-2 border-dashed border-blush-100/70 last:border-none animate-fade-up" style="animation-delay:${s.delay};">
                <div class="flex items-center gap-2.5 mb-3">
                    <span class="inline-block w-1.5 h-5 rounded-full bg-gradient-to-b ${s.accent}"></span>
                    <span class="${s.iconColor}">${SECTION_ICONS[s.iconKey]}</span>
                    <h3 class="text-xs sm:text-sm font-extrabold uppercase tracking-[1.5px] bg-gradient-to-r ${s.accent} bg-clip-text text-transparent">
                        ${s.title}
                    </h3>
                </div>
                <div class="text-sm sm:text-[15px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words bg-white rounded-2xl px-4 py-3.5 border-2 border-blush-100/70 shadow-sm">
                    ${escapeHtml(s.content)}
                </div>
            </div>
        `).join('');
    }

    // ---- escape HTML ----
    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ---- main handler ----
    async function handleGenerateDigest() {
        clearError();
        resetDigestDisplay();
        digestBtn.disabled = true;

        const apiKey = geminiKeyInput.value.trim();
        const caseText = caseTextArea.value.trim();

        if (!caseText) {
            showError('Please paste the case text in the case text area.');
            setStatus('Missing case text', 'warn');
            digestBtn.disabled = false;
            return;
        }

        if (!apiKey) {
            showError('Please enter your Gemini API key.');
            setStatus('Missing API key', 'warn');
            digestBtn.disabled = false;
            return;
        }

        try {
            const digestRaw = await generateDigest(caseText, apiKey);
            const sections = parseDigestSections(digestRaw);
            renderDigest(sections);
            setStatus('Digest generated successfully!', 'success');
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

    // ---- clear button ----
    clearBtn.addEventListener('click', () => {
        clearAll();
        caseTextArea.focus();
    });

    // ---- digest button ----
    digestBtn.addEventListener('click', handleGenerateDigest);

    // ---- Enter key on API key field ----
    geminiKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleGenerateDigest();
        }
    });

    // ---- initial state ----
    resetDigestDisplay();
    setStatus('Ready when you are', 'ready');
    caseTextArea.focus();
})();