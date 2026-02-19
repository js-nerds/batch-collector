import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BATCH_FLUSH_EVENT, BatchCollector } from "../src/index";

describe("BatchCollector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("flushes buffered items after delay", () => {
    const received: number[][] = [];
    const collector = new BatchCollector<number>({ delayMs: 100 });

    collector.subscribe(BATCH_FLUSH_EVENT, (items) => {
      received.push(items);
    });

    collector.push(1);
    collector.push(2);

    vi.advanceTimersByTime(99);
    expect(received).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(received).toEqual([[1, 2]]);
    expect(collector.items()).toEqual([]);
  });

  it("resets timer on push by default", () => {
    const received: string[][] = [];
    const collector = new BatchCollector<string>({ delayMs: 100 });

    collector.subscribe(BATCH_FLUSH_EVENT, (items) => {
      received.push(items);
    });

    collector.push("a");
    vi.advanceTimersByTime(50);
    collector.push("b");

    vi.advanceTimersByTime(50);
    expect(received).toEqual([]);

    vi.advanceTimersByTime(50);
    expect(received).toEqual([["a", "b"]]);
  });

  it("keeps first schedule when resetTimerOnPush is false", () => {
    const received: string[][] = [];
    const collector = new BatchCollector<string>({
      delayMs: 100,
      resetTimerOnPush: false
    });

    collector.subscribe(BATCH_FLUSH_EVENT, (items) => {
      received.push(items);
    });

    collector.push("a");
    vi.advanceTimersByTime(50);
    collector.push("b");

    vi.advanceTimersByTime(50);
    expect(received).toEqual([["a", "b"]]);
  });

  it("drains persisted localStorage batch on next instance creation", () => {
    const first = new BatchCollector<{ id: number }>({
      delayMs: 1000,
      storageType: "localStorage",
      storageKey: "batch-test"
    });

    first.push({ id: 1 });
    first.push({ id: 2 });

    const second = new BatchCollector<{ id: number }>({
      delayMs: 1000,
      storageType: "localStorage",
      storageKey: "batch-test"
    });

    expect(localStorage.getItem("batch-test")).toBeNull();
    expect(second.items()).toEqual([]);
  });


  it("treats non-array persisted value as empty batch", () => {
    localStorage.setItem("batch-invalid-shape", JSON.stringify({ id: 1 }));

    const collector = new BatchCollector<number>({
      delayMs: 100,
      storageType: "localStorage",
      storageKey: "batch-invalid-shape"
    });

    expect(collector.items()).toEqual([]);
    expect(localStorage.getItem("batch-invalid-shape")).toEqual(JSON.stringify({ id: 1 }));
  });

  it("clear removes pending items and persisted buffer", () => {
    const collector = new BatchCollector<number>({
      delayMs: 100,
      storageType: "sessionStorage",
      storageKey: "batch-clear"
    });

    collector.push(1);
    collector.push(2);
    expect(collector.items()).toEqual([1, 2]);

    expect(collector.clear()).toBe(true);
    expect(collector.items()).toEqual([]);
    expect(sessionStorage.getItem("batch-clear")).toBeNull();
  });

  it("supports manual clear mode when autoClear is false", () => {
    const received: number[][] = [];
    const collector = new BatchCollector<number>({
      delayMs: 100,
      autoClear: false
    });

    collector.subscribe(BATCH_FLUSH_EVENT, (items) => {
      received.push(items);
    });

    collector.push(10);
    collector.push(20);
    vi.advanceTimersByTime(100);

    expect(received).toEqual([[10, 20]]);
    expect(collector.items()).toEqual([10, 20]);

    collector.clear();
    expect(collector.items()).toEqual([]);
  });

  it("continues notifying listeners when one listener throws", () => {
    const received: number[][] = [];
    const collector = new BatchCollector<number>({ delayMs: 100 });

    collector.subscribe(BATCH_FLUSH_EVENT, () => {
      throw new Error("listener failed");
    });

    collector.subscribe(BATCH_FLUSH_EVENT, (items) => {
      received.push(items);
    });

    collector.push(1);
    collector.push(2);
    expect(() => vi.advanceTimersByTime(100)).not.toThrow();

    expect(received).toEqual([[1, 2]]);
    expect(collector.items()).toEqual([]);
  });
});
