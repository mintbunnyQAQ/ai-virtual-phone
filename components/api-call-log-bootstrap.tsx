"use client";

// components/api-call-log-bootstrap.tsx
// 全局挂载入口：在 layout.tsx 里引入，负责初始化 store 监听 + 渲染悬浮球。

import { ApiCallLogFloat } from "@/components/api-call-log-float";

// 导入 store 模块以激活其全局 DOM 事件监听器
import "@/lib/api-call-log-store";

export function ApiCallLogBootstrap() {
    return <ApiCallLogFloat />;
}
