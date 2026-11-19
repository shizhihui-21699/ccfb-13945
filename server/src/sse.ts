import type { ServerEvent } from 'bank-core';

type Listener = (event: ServerEvent) => void;

/** 极简 SSE 事件总线：服务器状态一变即推送给所有连接（网页端与手机端）。 */
class EventBus {
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event: ServerEvent): void {
    for (const fn of this.listeners) fn(event);
  }
}

export const eventBus = new EventBus();
