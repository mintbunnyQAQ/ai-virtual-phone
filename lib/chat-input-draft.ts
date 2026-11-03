// lib/chat-input-draft.ts
// 聊天输入框草稿：按会话 + 模式（线上/线下）持久化，返回键、关闭 App、刷新页面后内容不丢。
// 只存纯文本；发送成功后写入空串即自动清除该条草稿。

import { kvGet, kvSet, registerKvMigration } from "./kv-db";

export type ChatInputDraftMode = "online" | "offline";

type DraftEntry = { online?: string; offline?: string };
type DraftMap = Record<string, DraftEntry>;

const STORAGE_KEY = "ai_phone_chat_input_drafts_v1";
const MAX_DRAFT_CHARS = 20_000;
registerKvMigration(STORAGE_KEY);

function loadDraftMap(): DraftMap {
    if (typeof window === "undefined") return {};
    try {
        const raw = kvGet(STORAGE_KEY);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as DraftMap : {};
    } catch {
        return {};
    }
}

function saveDraftMap(map: DraftMap): void {
    if (typeof window === "undefined") return;
    try { kvSet(STORAGE_KEY, JSON.stringify(map)); } catch { /* 草稿失败不影响主流程 */ }
}

export function loadChatInputDraft(sessionId: string, mode: ChatInputDraftMode): string {
    if (!sessionId) return "";
    const entry = loadDraftMap()[sessionId];
    return entry?.[mode] ?? "";
}

export function saveChatInputDraft(sessionId: string, mode: ChatInputDraftMode, text: string): void {
    if (!sessionId) return;
    const map = loadDraftMap();
    const entry: DraftEntry = { ...(map[sessionId] || {}) };
    const value = text.length > MAX_DRAFT_CHARS ? text.slice(0, MAX_DRAFT_CHARS) : text;
    if (!value) {
        delete entry[mode];
    } else {
        entry[mode] = value;
    }
    if (!entry.online && !entry.offline) delete map[sessionId];
    else map[sessionId] = entry;
    saveDraftMap(map);
}

export function clearChatInputDraft(sessionId: string): void {
    if (!sessionId) return;
    const map = loadDraftMap();
    if (!map[sessionId]) return;
    delete map[sessionId];
    saveDraftMap(map);
}
