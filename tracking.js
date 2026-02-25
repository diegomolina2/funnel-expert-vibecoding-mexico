/**
 * US-02.5: Integrated Split-Testing & Analytics (v2)
 * Rotação Equalitária (Round-Robin) e Tracking de Métricas.
 */

class FunnelTracker {
    constructor(expertSlug, pageType) {
        this.expertSlug = expertSlug;
        this.pageType = pageType; // 'sales', 'upsell', 'downsell'
        this.matrixPath = 'headlines_matrix.json';
        this.storageKey = `funnel_expert_${expertSlug}_${pageType}_headline_v2`;
        this.logKey = `funnel_metrics_${expertSlug}`;
        this.config = null;
    }

    async init() {
        console.log(`[*] Iniciando Tracker Equalitário para: ${this.pageType}`);
        try {
            const response = await fetch(this.matrixPath);
            if (!response.ok) throw new Error("Matrix not found");
            this.config = await response.json();
            this.rotateHeadline();
            this.setupListeners();
            this.checkDebugMode();
        } catch (e) {
            console.error("[X] Erro no Tracker:", e);
        }
    }

    /**
     * Rotação Equalitária (Round-Robin):
     * Garante que as 10 headlines sejam distribuídas igualmente.
     */
    rotateHeadline() {
        const headlines = this.config.pages[this.pageType];
        if (!headlines || headlines.length === 0) return;

        // Persistência por Sessão: Mantém a mesma headline para o mesmo usuário nesta visita
        let activeId = sessionStorage.getItem(this.storageKey);
        let activeHeadline;

        if (activeId) {
            activeHeadline = headlines.find(h => h.id === activeId);
        }

        if (!activeHeadline) {
            // Lógica de Distribuição Equalitária usando um ponteiro no localStorage
            const pointerKey = `${this.storageKey}_pointer`;
            let lastIndex = parseInt(localStorage.getItem(pointerKey) || "-1");
            let nextIndex = (lastIndex + 1) % headlines.length;

            activeHeadline = headlines[nextIndex];

            localStorage.setItem(pointerKey, nextIndex.toString());
            sessionStorage.setItem(this.storageKey, activeHeadline.id);
        }

        this.applyHeadline(activeHeadline);
        this.track('view', activeHeadline.id);
    }

    applyHeadline(item) {
        const targetH = document.getElementById('main-headline');
        const targetS = document.getElementById('sub-headline');

        if (targetH) targetH.innerHTML = item.headline;
        if (targetS) targetS.innerHTML = item.subheadline;

        console.log(`[🎯] Headline Ativa (${item.id}): ${item.headline}`);
    }

    setupListeners() {
        document.querySelectorAll('.cta-button').forEach(btn => {
            btn.addEventListener('click', () => {
                const activeId = sessionStorage.getItem(this.storageKey);
                this.track('click', activeId);
            });
        });
    }

    track(event, headlineId) {
        const data = {
            timestamp: new Date().toISOString(),
            page: this.pageType,
            event: event,
            headlineId: headlineId,
            url: window.location.href
        };

        // 1. Local Storage (Para debug e analytics local)
        let logs = JSON.parse(localStorage.getItem(this.logKey) || '[]');
        logs.push(data);
        localStorage.setItem(this.logKey, JSON.stringify(logs.slice(-1000)));

        // 2. Global Strategy (Webhook/Backend/Supabase)
        // Se houver uma constante GLOBAL_TRACKING_URL (ex: Make.com ou Edge Function)
        // Ou variáveis Supabase injetadas no HTML
        const payload = {
            expert_slug: this.expertSlug,
            page_type: this.pageType,
            headline_id: headlineId,
            event_type: event
        };

        if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
            fetch(`${window.SUPABASE_URL}/rest/v1/funnel_metrics`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': window.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(payload)
            }).catch(() => { });
        } else if (window.GLOBAL_TRACKING_URL) {
            fetch(window.GLOBAL_TRACKING_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }).catch(() => { });
        }

        console.log(`[📊] TRACK: ${event} | ID: ${headlineId}`);
    }

    checkDebugMode() {
        // Atalho: Alt + Shift + A para ver analytics local
        window.addEventListener('keydown', (e) => {
            if (e.altKey && e.shiftKey && e.code === 'KeyA') {
                this.showAnalyticsOverlay();
            }
        });

        if (window.location.search.includes('debug=true')) {
            this.showAnalyticsOverlay();
        }
    }

    showAnalyticsOverlay() {
        const logs = JSON.parse(localStorage.getItem(this.logKey) || '[]');
        const stats = {};

        logs.forEach(log => {
            if (!stats[log.headlineId]) stats[log.headlineId] = { views: 0, clicks: 0 };
            if (log.event === 'view') stats[log.headlineId].views++;
            if (log.event === 'click') stats[log.headlineId].clicks++;
        });

        let html = `
            <div id="analytics-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); color:white; z-index:9999; padding:40px; font-family:sans-serif; overflow-y:auto;">
                <h2 style="color:#f59e0b">📊 Funnel Expert Analytics (Local)</h2>
                <button onclick="document.getElementById('analytics-overlay').remove()" style="position:absolute; top:20px; right:20px; padding:10px 20px; background:#ef4444; border:none; color:white; cursor:pointer;">Fechar</button>
                <table style="width:100%; border-collapse:collapse; margin-top:20px;">
                    <tr style="border-bottom:2px solid #334155; text-align:left;">
                        <th style="padding:10px;">ID Headline</th>
                        <th style="padding:10px;">Views</th>
                        <th style="padding:10px;">Clicks</th>
                        <th style="padding:10px;">CTR (%)</th>
                    </tr>
        `;

        Object.keys(stats).forEach(id => {
            const s = stats[id];
            const ctr = ((s.clicks / s.views) * 100).toFixed(2);
            html += `
                <tr style="border-bottom:1px solid #1e293b;">
                    <td style="padding:10px;">${id}</td>
                    <td style="padding:10px;">${s.views}</td>
                    <td style="padding:10px;">${s.clicks}</td>
                    <td style="padding:10px; color:#f59e0b; font-weight:bold;">${ctr}%</td>
                </tr>
            `;
        });

        html += `</table><p style="margin-top:20px; font-size:12px; color:#94a3b8;">* Dados baseados no seu navegador atual. Para dados globais, conecte um Webhook.</p></div>`;

        const existing = document.getElementById('analytics-overlay');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', html);
    }
}

// Auto-Init
if (typeof window !== 'undefined') {
    const slug = window.EXPERT_SLUG || 'default';
    const page = window.PAGE_TYPE || 'sales';
    const tracker = new FunnelTracker(slug, page);
    window.onload = () => tracker.init();
}
