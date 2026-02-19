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

    vi.runOnlyPendingTimers();

    expect(localStorage.getItem("batch-test")).toBeNull();
    expect(second.items()).toEqual([]);
  });

  it("re-flushes persisted localStorage batch to listeners on next instance creation", () => {
    const key = "batch-test-reflush";

    const first = new BatchCollector<{ id: number }>({
      delayMs: 1000,
      storageType: "localStorage",
      storageKey: key
    });

    first.push({ id: 1 });
    first.push({ id: 2 });

    const received: { id: number }[][] = [];
    const second = new BatchCollector<{ id: number }>({
      delayMs: 1000,
      storageType: "localStorage",
      storageKey: key
    });

    second.subscribe(BATCH_FLUSH_EVENT, (items) => {
      received.push(items);
    });

    vi.runOnlyPendingTimers();

    expect(received).toEqual([[{ id: 1 }, { id: 2 }]]);
    expect(localStorage.getItem(key)).toBeNull();
    expect(second.items()).toEqual([]);
  });


  it("claims persisted localStorage batch before async replay", () => {
    const key = "batch-test-claim";

    const first = new BatchCollector<{ id: number }>({
      delayMs: 1000,
      storageType: "localStorage",
      storageKey: key
    });

    first.push({ id: 1 });

    const receivedSecond: { id: number }[][] = [];
    const second = new BatchCollector<{ id: number }>({
      delayMs: 1000,
      storageType: "localStorage",
      storageKey: key
    });

    second.subscribe(BATCH_FLUSH_EVENT, (items) => {
      receivedSecond.push(items);
    });

    const receivedThird: { id: number }[][] = [];
    const third = new BatchCollector<{ id: number }>({
      delayMs: 1000,
      storageType: "localStorage",
      storageKey: key
    });

    third.subscribe(BATCH_FLUSH_EVENT, (items) => {
      receivedThird.push(items);
    });

    vi.runOnlyPendingTimers();

    expect(receivedSecond).toEqual([[{ id: 1 }]]);
    expect(receivedThird).toEqual([]);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("keeps persisted localStorage recovery when autoClear is false", () => {
    const key = "batch-test-autoclear-false";

    const first = new BatchCollector<{ id: number }>({
      delayMs: 1000,
      storageType: "localStorage",
      storageKey: key,
      autoClear: false
    });

    first.push({ id: 1 });

    const received: { id: number }[][] = [];
    const second = new BatchCollector<{ id: number }>({
      delayMs: 1000,
      storageType: "localStorage",
      storageKey: key,
      autoClear: false
    });

    second.subscribe(BATCH_FLUSH_EVENT, (items) => {
      received.push(items);
    });

    vi.runOnlyPendingTimers();

    expect(received).toEqual([[{ id: 1 }]]);
    expect(localStorage.getItem(key)).toBe(JSON.stringify([{ id: 1 }]));
    expect(second.items()).toEqual([{ id: 1 }]);

    second.clear();
    expect(localStorage.getItem(key)).toBeNull();
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
});
