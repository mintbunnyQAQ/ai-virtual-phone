"use client";

// components/api-call-log-float.tsx
// 独立悬浮球：展示最近 10 条 API 调用记录（成功 + 失败）。
// 设置 → Tools 里开启 apiCallLogEnabled 后显示。

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";
import { Activity, Trash2, X, CheckCircle2, XCircle } from "lucide-react";
import { CHAT_APP_SETTINGS_UPDATED_EVENT, loadChatAppSettings } from "@/lib/chat-storage";
import {
    getApiCallRecords,
    clearApiCallRecords,
    subscribeApiCallRecords,
    getLatestEstimate,
    type ApiCallRecord,
} from "@/lib/api-call-log-store";

function formatTime(iso: string): string {
    try {
        const d = new Date(iso);
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
    } catch {
        return "--:--:--";
    }
}

function formatCompletionTokens(usage?: ApiCallRecord["usage"]): string {
    if (!usage || typeof usage.completion_tokens !== "number") return "";
    return `${usage.completion_tokens.toLocaleString()} tokens`;
}

type FloatingPosition = { left: number; top: number };
type DragState = {
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    maxLeft: number;
    maxTop: number;
    moved: boolean;
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(min, value), max);
}

export function ApiCallLogFloat() {
    const [enabled, setEnabled] = useState(false);
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<FloatingPosition | null>(null);
    const [dragging, setDragging] = useState(false);
    const dragRef = useRef<DragState | null>(null);
    const suppressClickRef = useRef(false);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const layerRef = useRef<HTMLDivElement | null>(null);

    const records = useSyncExternalStore(subscribeApiCallRecords, getApiCallRecords, getApiCallRecords);
    const errorCount = records.filter(r => r.status === "error").length;

    // 监听设置开关
    useEffect(() => {
        const sync = () => {
            const settings = loadChatAppSettings();
            const next = settings.apiCallLogEnabled === true;
            setEnabled(next);
            if (!next) setOpen(false);
        };
        sync();
        window.addEventListener(CHAT_APP_SETTINGS_UPDATED_EVENT, sync);
        return () => window.removeEventListener(CHAT_APP_SETTINGS_UPDATED_EVENT, sync);
    }, []);

    // 点外面关闭
    useEffect(() => {
        if (!open) return;
        const handler = (e: PointerEvent) => {
            if (!layerRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("pointerdown", handler);
        return () => document.removeEventListener("pointerdown", handler);
    }, [open]);

    // ── 拖拽 ──
    const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        const parent = btn.offsetParent instanceof HTMLElement ? btn.offsetParent : null;
        const pw = parent?.getBoundingClientRect().width ?? window.innerWidth;
        const ph = parent?.getBoundingClientRect().height ?? window.innerHeight;
        const pos = position ?? { left: btn.offsetLeft, top: btn.offsetTop };
        dragRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            originLeft: pos.left,
            originTop: pos.top,
            maxLeft: Math.max(12, pw - 52 - 12),
            maxTop: Math.max(12, ph - 52 - 12),
            moved: false,
        };
        btn.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
        const d = dragRef.current;
        if (!d || d.pointerId !== e.pointerId) return;
        e.stopPropagation();
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (!d.moved) {
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                d.moved = true;
                setDragging(true);
            } else return;
        }
        setPosition({
            left: clamp(d.originLeft + dx, 12, d.maxLeft),
            top: clamp(d.originTop + dy, 12, d.maxTop),
        });
    };

    const handlePointerEnd = (e: ReactPointerEvent<HTMLButtonElement>) => {
        const d = dragRef.current;
        if (!d || d.pointerId !== e.pointerId) return;
        e.stopPropagation();
        if (d.moved) suppressClickRef.current = true;
        dragRef.current = null;
        setDragging(false);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
    };

    const handleClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
        }
        setOpen(prev => !prev);
    };

    const handleClear = useCallback(() => {
        clearApiCallRecords();
    }, []);

    if (!enabled) return null;

    const btnStyle: CSSProperties = position
        ? { left: position.left, top: position.top, position: "absolute" }
        : { bottom: 88, left: 18, position: "absolute" };

    return (
        <div className="api-call-log-layer" ref={layerRef}>
            <button
                ref={buttonRef}
                type="button"
                className={`api-call-log-float-btn${open ? " is-open" : ""}`}
                style={btnStyle}
                aria-label="API 调用记录"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
                onClick={handleClick}
            >
                <Activity size={22} strokeWidth={1.9} />
                {errorCount > 0 && !open && (
                    <span className="api-call-log-badge">{errorCount}</span>
                )}
            </button>

            {open && (
                <div className="api-call-log-panel" onClick={e => e.stopPropagation()}>
                    <div className="api-call-log-header">
                        <div className="api-call-log-title">
                            <Activity size={16} />
                            <span>API 调用记录</span>
                            <span className="api-call-log-count">{records.length}/10</span>
                        </div>
                        <div className="api-call-log-actions">
                            <button type="button" onClick={handleClear} aria-label="清空" title="清空记录">
                                <Trash2 size={15} />
                            </button>
                            <button type="button" onClick={() => setOpen(false)} aria-label="关闭">
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                    <LatestPromptTokenBar records={records} />
                    <div className="api-call-log-body">
                        {records.length === 0 ? (
                            <div className="api-call-log-empty">暂无调用记录</div>
                        ) : (
                            [...records].reverse().map(record => (
                                <RecordItem key={record.id} record={record} />
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function LatestPromptTokenBar({ records }: { records: ApiCallRecord[] }) {
    const estimate = getLatestEstimate();
    // API 返回的精确值：取最近一条有 usage 的记录
    let apiPrompt: number | null = null;
    for (let i = records.length - 1; i >= 0; i--) {
        const u = records[i].usage;
        if (u && typeof u.prompt_tokens === "number") {
            apiPrompt = u.prompt_tokens;
            break;
        }
    }
    return (
        <div className="api-call-log-token-bar">
            <span className="api-call-log-token-label">本轮发送</span>
            <span className="api-call-log-token-value">
                {estimate !== null
                    ? `≈${estimate.toLocaleString()}`
                    : "-"
                }
                {apiPrompt !== null
                    ? <span className="api-call-log-token-exact">（实际 {apiPrompt.toLocaleString()}）</span>
                    : null
                }
            </span>
        </div>
    );
}

function RecordItem({ record }: { record: ApiCallRecord }) {
    const [expanded, setExpanded] = useState(false);
    const isError = record.status === "error";
    const completionTokens = formatCompletionTokens(record.usage);

    return (
        <div
            className={`api-call-log-item${isError ? " is-error" : ""}`}
            onClick={() => setExpanded(prev => !prev)}
        >
            <div className="api-call-log-item-head">
                <span className="api-call-log-item-icon">
                    {isError
                        ? <XCircle size={14} />
                        : <CheckCircle2 size={14} />
                    }
                </span>
                <span className="api-call-log-item-model">{record.model || "unknown"}</span>
                <span className="api-call-log-item-time">{formatTime(record.timestamp)}</span>
            </div>
            {expanded && (
                <div className="api-call-log-item-detail">
                    <div><span className="api-call-log-label">Provider</span>{record.provider || "-"}</div>
                    <div><span className="api-call-log-label">来源</span>{record.source || "-"}</div>
                    {record.characterName && (
                        <div><span className="api-call-log-label">角色</span>{record.characterName}</div>
                    )}
                    {completionTokens && (
                        <div><span className="api-call-log-label">接收</span>{completionTokens}</div>
                    )}
                    {isError && record.errorMessage && (
                        <div className="api-call-log-error-msg">
                            <span className="api-call-log-label">错误</span>
                            <span>{record.errorMessage}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
