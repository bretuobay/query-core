import { QueryCore, EndpointState } from '../src/QueryCore';
import { describe, it, expect, beforeEach, afterEach } from './runner/testRunner.js';
import { mockFetch, resetFetch, getFetchCalls } from './mocks/mockFetch.js';
import { setupMockLocalStorage, resetMockLocalStorage } from './mocks/mockLocalStorage.js';
import { setupMockIndexedDB, resetMockIndexedDB } from './mocks/mockIndexedDB.js';

describe('QueryCore - Behavioral Tests', () => {
  let qc: QueryCore;
  const endpointKey = 'behavioralTest';
  const initialData = { id: 1, content: 'Initial Data' };
  const updatedData = { id: 1, content: 'Updated Data' };

  // Manual Date mock
  let currentTime: number;
  let originalDateNow: () => number;

  beforeEach(async () => {
    currentTime = 1000000000000;
    originalDateNow = Date.now;
    globalThis.Date.now = () => currentTime;
    globalThis.advanceTime = (ms: number) => { currentTime += ms; };

    setupMockLocalStorage();
    setupMockIndexedDB();
    mockFetch(async () => ({ data: initialData, status: 200 })); // Default mock

    qc = new QueryCore();
    // Define endpoint used by most tests in this suite
    await qc.defineEndpoint(endpointKey, async () => {
      const res = await fetch(`/${endpointKey}`);
      return res.json();
    }, { refetchAfter: 200 }); // Relatively short refetchAfter for some tests
  });

  afterEach(() => {
    resetFetch();
    resetMockLocalStorage();
    resetMockIndexedDB();
    Date.now = originalDateNow;
    // Consider qc.destroy() or similar if global listeners need explicit cleanup between tests
  });

  it('Multiple components subscribing at different times to the same endpoint', async (done) => {
    let sub1State: EndpointState<any> | null = null;
    let sub2State: EndpointState<any> | null = null;
    let sub1FetchCount = 0;
    let sub2FetchCount = 0;

    // Component 1 subscribes first
    const unsub1 = qc.subscribe(endpointKey, (state) => {
      sub1State = JSON.parse(JSON.stringify(state));
      if (!state.isLoading && state.data?.content === initialData.content) sub1FetchCount++;
      if (!state.isLoading && state.data?.content === updatedData.content) sub1FetchCount++;
    });
    // Initial fetch for sub1 (due to no data)
    await new Promise(r => setTimeout(r, 50)); // let fetch complete
    expect(sub1State?.data).toEqual(initialData);
    expect(sub1FetchCount).toBe(1); // Initial fetch done

    // Component 2 subscribes later, should get cached data initially
    const unsub2 = qc.subscribe(endpointKey, (state) => {
      sub2State = JSON.parse(JSON.stringify(state));
      if (!state.isLoading && state.data?.content === initialData.content && sub2FetchCount === 0) sub2FetchCount++; // gets initial cache
      if (!state.isLoading && state.data?.content === updatedData.content) sub2FetchCount++; // gets update
    });
    await new Promise(r => setTimeout(r, 10)); // let subscription provide cached data
    expect(sub2State?.data).toEqual(initialData); // Gets cached data
    expect(sub2FetchCount).toBe(1);

    // Advance time to make data stale & mock new data
    // @ts-ignore
    globalThis.advanceTime(250); // Past refetchAfter: 200
    mockFetch(async () => ({ data: updatedData, status: 200 }));

    // Trigger a refetch (e.g., window focus, or another component interacts)
    // For this test, let's assume a window focus triggers check for observed stale queries
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await new Promise(r => setTimeout(r, 50)); // let refetch complete

    expect(sub1State?.data).toEqual(updatedData);
    expect(sub2State?.data).toEqual(updatedData);
    expect(sub1FetchCount).toBe(2); // Received update
    expect(sub2FetchCount).toBe(2); // Received update

    unsub1();
    unsub2();
    done();
  });

  it('Rapidly subscribing and unsubscribing', async () => {
    const manualSpy = (name: string) => { // Moved manualSpy inside the test or make it globally available in test setup
        let callCount = 0;
        const calls: any[] = [];
        const fn = (arg: any) => { callCount++; calls.push(arg); };
        fn.getCallCount = () => callCount;
        fn.getCalls = () => calls;
        return fn;
    };
    const spiedCallback1 = manualSpy('cb1');
    const spiedCallback2 = manualSpy('cb2');


    const unsub1 = qc.subscribe(endpointKey, spiedCallback1);
    // Initial fetch will be triggered by first subscribe
    await new Promise(r => setTimeout(r, 50)); // Allow fetch to occur

    expect(spiedCallback1.getCallCount()).toBeGreaterThanOrEqual(2); // initial (undefined/cached), loading, success

    unsub1(); // Unsubscribe first one

    const unsub2 = qc.subscribe(endpointKey, spiedCallback2); // Second subscribes, gets cached data
    await new Promise(r => setTimeout(r, 10));

    expect(spiedCallback2.getCallCount()).toBe(1); // Gets current (cached) state
    expect(spiedCallback2.getCalls()[0].data).toEqual(initialData);

    const callCount1BeforeNextRefetch = spiedCallback1.getCallCount();

    // Trigger another fetch
    mockFetch(async () => ({ data: updatedData, status: 200 }));
    await qc.refetch(endpointKey); // Force refetch

    expect(spiedCallback1.getCallCount()).toBe(callCount1BeforeNextRefetch); // cb1 is unsubscribed, should not be called
    expect(spiedCallback2.getCallCount()).toBeGreaterThan(1); // cb2 should get loading and then new data

    const lastCallCb2 = spiedCallback2.getCalls()[spiedCallback2.getCallCount()-1];
    expect(lastCallCb2.data).toEqual(updatedData);

    unsub2();
  });

  it('Handling of network errors during fetch (subscriber perspective)', async (done) => {
    mockFetch(async () => { throw new Error("Simulated Network Failure"); });

    let states: EndpointState<any>[] = [];
    const unsubscribe = qc.subscribe(endpointKey, (state) => {
      states.push(JSON.parse(JSON.stringify(state)));

      if (states.length === 3) { // initial (undef), loading, error
        expect(states[0].isError).toBe(false);
        expect(states[1].isLoading).toBe(true);
        expect(states[2].isLoading).toBe(false);
        expect(states[2].isError).toBe(true);
        expect(states[2].error).toBeInstanceOf(Error);
        expect(states[2].error.message).toBe("Simulated Network Failure");
        unsubscribe();
        done();
      }
    });
    // Fetch is triggered by subscribe if no data
  });

  it('Window focus refetches only stale observed queries', async () => {
    const endpointFresh = 'freshKey';
    const endpointStale = 'staleKey';

    await qc.defineEndpoint(endpointFresh, async () => ({data: 'fresh_data'}), { refetchAfter: 10000 });
    await qc.defineEndpoint(endpointStale, async () => ({data: 'stale_data_new'}), { refetchAfter: 100 });

    // Fetch both initially
    // @ts-ignore
    globalThis.Date.now = () => 1000000000000;
    mockFetch(async (url) => (url as string).includes(endpointFresh) ? ({data: 'fresh_data_initial'}) : ({data: 'stale_data_initial'}));
    await qc.refetch(endpointFresh);
    await qc.refetch(endpointStale);

    const freshDataTime = qc.getState(endpointFresh).lastUpdated;
    const staleDataTime = qc.getState(endpointStale).lastUpdated;

    // Subscribe to both
    qc.subscribe(endpointFresh, () => {});
    qc.subscribe(endpointStale, () => {});

    // Advance time so endpointStale is stale, but endpointFresh is not
    // @ts-ignore
    globalThis.Date.now = () => 1000000000000 + 500; // staleKey (100ms) is stale, freshKey (10s) is not

    const fetchCallsBeforeFocus = getFetchCalls().length;

    mockFetch(async (url) => { // Mock new data only for stale endpoint
        if((url as string).includes(endpointStale)) return ({data: 'stale_data_updated_on_focus'});
        return ({data: 'fresh_data_initial'}); // Should not be called for freshKey
    });

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r => setTimeout(r, 50));

    expect(getFetchCalls().length).toBe(fetchCallsBeforeFocus + 1); // Only one extra fetch call
    expect(getFetchCalls().pop()?.url).toContain(endpointStale);
    expect(qc.getState(endpointFresh).lastUpdated).toBe(freshDataTime); // Fresh data not refetched
    expect(qc.getState(endpointStale).data).toEqual('stale_data_updated_on_focus'); // Stale data refetched
    expect(qc.getState(endpointStale).lastUpdated).toBeGreaterThan(staleDataTime);
  });
});
