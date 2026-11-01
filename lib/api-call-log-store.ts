// lib/api-call-log-store.ts
// 精简 API 调用记录：保留最近 10 条（成功 + 失败），悬浮球面板展示。
// 通过 DOM 事件 "api-call-event" 收集数据，与 chat-engine / api-log-store 零耦合。

import { kvGet, kvSet, registerKvMigration } from "./kv-db";

export type ApiCallRecord = {
    id: string;
    timestamp: string;
    model: string;
    provider: string;
    characterName?: string;
    source: string;
    status: "success" | "error";
    errorMessage?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

const STORAGE_KEY = "ai_phone_api_call_log_v1";
const MAX_RECORDS = 10;
registerKvMigration(STORAGE_KEY);

let _records: ApiCallRecord[] | null = null;
const _listeners = new Set<() => void>();

function loadRecords(): ApiCallRecord[] {
    if (_records) return _records;
    try {
        const raw = typeof window !== "undefined" ? kvGet(STORAGE_KEY) : null;
        _records = raw ? JSON.parse(raw) as ApiCallRecord[] : [];
    } catch {
        _records = [];
    }
    return _records;
}

function saveRecords(records: ApiCallRecord[]): void {
    _records = records;
    try { kvSet(STORAGE_KEY, JSON.stringify(records)); } catch { /* ignore */ }
    _listeners.forEach(fn => fn());
}

function pushRecord(entry: Omit<ApiCallRecord, "id" | "timestamp">): void {
    const records = [...loadRecords()];
    records.push({
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
    });
    while (records.length > MAX_RECORDS) records.shift();
    saveRecords(records);
}

export function getApiCallRecords(): ApiCallRecord[] {
    return loadRecords();
}

export function clearApiCallRecords(): void {
    saveRecords([]);
}

export function subscribeApiCallRecords(fn: () => void): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
}

// ── 本地估算：发送时立刻计算 ──────────────────────────
// 中文字符 × 1.5，英文字母 × 0.3，其余字符 × 0.5
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
const ASCII_LETTER_RE = /[a-zA-Z]/;

function estimateTokens(text: string): number {
    let tokens = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (CJK_RE.test(ch)) tokens += 1.5;
        else if (ASCII_LETTER_RE.test(ch)) tokens += 0.3;
        else tokens += 0.5;
    }
    return Math.round(tokens);
}

let _latestEstimate: number | null = null;

export function getLatestEstimate(): number | null {
    return _latestEstimate;
}

// ── 自动监听 DOM 事件 ──────────────────────────
// chat-engine（错误路径）和 api-log-store（成功路径）通过
// window.dispatchEvent(new CustomEvent("api-call-event", { detail }))
// 把调用结果送过来，这里统一收集。
if (typeof window !== "undefined") {
    // 请求发出瞬间的本地估算（中文×1.5, 英文×0.3）
    window.addEventListener("api-call-estimate", (e: Event) => {
        const d = (e as CustomEvent).detail;
        if (!d || typeof d !== "object") return;
        const bodyText = String(d.bodyText ?? "");
        _latestEstimate = bodyText ? estimateTokens(bodyText) : null;
        _listeners.forEach(fn => fn());
    });

    window.addEventListener("api-call-event", (e: Event) => {
        const d = (e as CustomEvent).detail;
        if (!d || typeof d !== "object") return;
        pushRecord({
            model: String(d.model ?? ""),
            provider: String(d.provider ?? ""),
            characterName: d.characterName ? String(d.characterName) : undefined,
            source: String(d.source ?? "chat"),
            status: d.status === "error" ? "error" : "success",
            errorMessage: d.errorMessage ? String(d.errorMessage).slice(0, 500) : undefined,
            usage: d.usage && typeof d.usage === "object" ? d.usage : undefined,
        });
    });
}
