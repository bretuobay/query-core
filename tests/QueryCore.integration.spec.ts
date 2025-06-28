import QueryCore, { EndpointState } from '../src/QueryCore';
import { describe, it, expect, beforeEach, afterEach } from './runner/testRunner.js';
import { mockFetch, resetFetch } from './mocks/mockFetch.js';
import { setupMockLocalStorage, resetMockLocalStorage } from './mocks/mockLocalStorage.js';
import { setupMockIndexedDB, resetMockIndexedDB, setMockIndexedDBOperationDelay } from './mocks/mockIndexedDB.js';

describe('QueryCore - Integration Tests', () => {
  let qc: QueryCore;
  const endpointKey = 'integrationUser';
  const initialUser = { id: 1, name: 'Alice' };
  const updatedUser = { id: 1, name: 'Alice Updated' };

  // Manual Date mock for controlling time
  let currentTime: number;
  let originalDateNow: () => number;

  beforeEach(async () => {
    currentTime = 1000000000000;
    originalDateNow = Date.now;
    globalThis.Date.now = () => currentTime;
    globalThis.advanceTime = (ms: number) => {
      currentTime += ms;
    };

    setupMockLocalStorage();
    setupMockIndexedDB();
    // Default mockFetch returns initialUser, can be overridden
    mockFetch(async (url) => {
      if ((url as string).includes(endpointKey)) return { data: initialUser, status: 200 };
      return { data: {}, status: 200 };
    });

    // qc instance will be created in tests to vary options if needed
  });

  afterEach(() => {
    resetFetch();
    resetMockLocalStorage();
    resetMockIndexedDB();
    Date.now = originalDateNow; // Restore original Date.now
    // qc.destroy() // if available for cleaning up global listeners
  });

  it('Lifecycle: fetch, cache (LS), subscribe, retrieve, then manual refetch', async (done) => {
    qc = new QueryCore({ cacheProvider: 'localStorage' });
    await qc.defineEndpoint(endpointKey, async () => {
      const res = await fetch(`/${endpointKey}`); // uses mockFetch
      return res.json();
    });

    let callCount = 0;
    const statesReceived: EndpointState<any>[] = [];

    qc.subscribe(endpointKey, (state) => {
      statesReceived.push(JSON.parse(JSON.stringify(state))); // Deep copy for inspection
      callCount++;

      if (callCount === 1) {
        // Initial state (empty as cache is clear)
        expect(state.data).toBe(undefined);
        expect(state.isLoading).toBe(false); // defineEndpoint loads from cache (miss)
      } else if (callCount === 2 && state.isLoading) {
        // Loading (from auto-fetch on subscribe due to no data)
        expect(state.data).toBe(undefined);
      } else if (callCount === 3 && !state.isLoading && !state.isError) {
        // Fetched initialUser
        expect(state.data).toEqual(initialUser);
        expect(state.isLoading).toBe(false);

        // Verify cache
        const cachedRaw = localStorage.getItem(`QueryCore_${endpointKey}`);
        expect(cachedRaw).toBeTruthy();
        expect(JSON.parse(cachedRaw!).data).toEqual(initialUser);

        // Trigger manual refetch with new data
        mockFetch(async () => ({ data: updatedUser, status: 200 }));
        qc.refetch(endpointKey);
      } else if (callCount === 4 && state.isLoading) {
        // Loading for updatedUser
        expect(state.data).toEqual(initialUser); // Previous data still there
      } else if (callCount === 5 && !state.isLoading && !state.isError) {
        // Fetched updatedUser
        expect(state.data).toEqual(updatedUser);
        // Verify cache updated
        const cachedRawUpdated = localStorage.getItem(`QueryCore_${endpointKey}`);
        expect(JSON.parse(cachedRawUpdated!).data).toEqual(updatedUser);
        done();
      }
    });
    // Subscription should trigger initial fetch because there's no data.
  });

  it('Automatic refetching with refetchAfter and multiple subscribers', async (done) => {
    const refetchAfterMs = 100;
    qc = new QueryCore({ cacheProvider: 'localStorage' });
    await qc.defineEndpoint(
      endpointKey,
      async () => {
        const res = await fetch(`/${endpointKey}`); // uses mockFetch
        return res.json();
      },
      { refetchAfter: refetchAfterMs },
    );

    // Initial fetch
    await qc.refetch(endpointKey); // Populates cache with initialUser
    expect(qc.getState(endpointKey).data).toEqual(initialUser);
    const firstFetchTime = qc.getState(endpointKey).lastUpdated;

    let sub1Notifications = 0;
    let sub2Notifications = 0;
    let sub1FinalData: any, sub2FinalData: any;

    qc.subscribe(`${endpointKey}_sub1`, (state) => {
      // Using different key to avoid clash if needed by test runner
      sub1Notifications++;
      if (state.data?.name === updatedUser.name) sub1FinalData = state.data;
    });

    qc.subscribe(`${endpointKey}_sub2`, (state) => {
      // Using different key
      sub2Notifications++;
      if (state.data?.name === updatedUser.name) sub2FinalData = state.data;
    });

    // Re-subscribe to the actual endpointKey for the refetchAfter logic to kick in
    // The above subscriptions are more for testing multiple subscribers receiving updates.
    // The primary subscription that drives refetchAfter needs to be on endpointKey
    let primarySubNotifications = 0;
    qc.subscribe(endpointKey, (state) => {
      primarySubNotifications++;
      if (state.data?.name === initialUser.name && primarySubNotifications > 2) {
        // After initial load from refetch
        // Advance time to make data stale for the primary subscription
        // @ts-ignore
        globalThis.advanceTime(refetchAfterMs + 1);
        // Update mockFetch to return new data for the automatic refetch
        mockFetch(async () => ({ data: updatedUser, status: 200 }));
        // The refetch should be triggered by QueryCore's internal mechanisms for observed stale queries,
        // typically on next interaction or internal timer if implemented.
        // For this test, we rely on the window focus / visibility change as a trigger for observed queries.
        // Or, if subscribe itself triggers refetch for stale data.
        // Let's simulate a window focus to trigger the check for stale observed queries.
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      } else if (state.data?.name === updatedUser.name) {
        // Both subscribers should eventually get the updatedUser data
        // Need a small delay for events to propagate and refetch to complete
        setTimeout(() => {
          // Since sub1 and sub2 are on different keys, they won't get this update.
          // This test needs refinement to show multiple subscribers on SAME key.
          // Let's simplify: two subscribers on the same key.
        }, 50);
      }
    });

    // This test needs to be re-thought for multiple subscribers on the SAME key
    // and how the automatic refetch is triggered and observed by them.

    // Simplified test for multiple subscribers on the same key:
    qc = new QueryCore({ cacheProvider: 'localStorage' }); // Reset QC
    await qc.defineEndpoint(
      endpointKey,
      async () => {
        const res = await fetch(`/${endpointKey}`);
        return res.json();
      },
      { refetchAfter: refetchAfterMs },
    );
    await qc.refetch(endpointKey); // initialUser

    let s1Data: any, s2Data: any;
    let s1Loading = false,
      s2Loading = false;
    let s1UpdateCount = 0,
      s2UpdateCount = 0;

    qc.subscribe(endpointKey, (state) => {
      s1UpdateCount++;
      if (state.isLoading) s1Loading = true;
      if (!state.isLoading && state.data) s1Data = state.data;
    });
    qc.subscribe(endpointKey, (state) => {
      s2UpdateCount++;
      if (state.isLoading) s2Loading = true;
      if (!state.isLoading && state.data) s2Data = state.data;
    });

    // All subscribers get initial data
    expect(s1Data).toEqual(initialUser);
    expect(s2Data).toEqual(initialUser);
    const initialUpdateCount1 = s1UpdateCount;
    const initialUpdateCount2 = s2UpdateCount;

    // @ts-ignore
    globalThis.advanceTime(refetchAfterMs + 10); // Make data stale
    mockFetch(async () => ({ data: updatedUser, status: 200 })); // Setup next fetch

    // Trigger a check, e.g., by focusing window or another refetch on a different key
    // (to allow natural stale check on observed 'endpointKey')
    // Or, if subscribe triggers for stale on observed, one of these subscriptions might already do it.
    // The test for `refetch on subscribe if data is stale` covers that.
    // Let's rely on window focus to trigger check for observed stale queries
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await new Promise((resolve) => setTimeout(resolve, 100)); // Allow time for refetch and notifications

    expect(s1Loading).toBe(true); // Should have gone through loading
    expect(s2Loading).toBe(true);
    expect(s1Data).toEqual(updatedUser);
    expect(s2Data).toEqual(updatedUser);
    expect(s1UpdateCount).toBeGreaterThan(initialUpdateCount1 + 1); // initial, loading, new_data
    expect(s2UpdateCount).toBeGreaterThan(initialUpdateCount2 + 1);
    done();
  });

  it('Correct state transitions with IndexedDB', async (done) => {
    qc = new QueryCore({ cacheProvider: 'indexedDB' });
    setMockIndexedDBOperationDelay(10); // Simulate some IDB latency
    await qc.defineEndpoint(endpointKey, async () => {
      const res = await fetch(`/${endpointKey}`);
      return res.json();
    });

    const states: EndpointState<any>[] = [];
    qc.subscribe(endpointKey, (state) => {
      states.push(JSON.parse(JSON.stringify(state)));
      if (states.length === 5) {
        // initial(undef), loading(undef), success(initialUser), loading(initialUser), success(updatedUser)
        expect(states[0].isLoading).toBe(false);
        expect(states[0].data).toBeUndefined(); // initial after define
        expect(states[1].isLoading).toBe(true);
        expect(states[1].data).toBeUndefined(); // loading for initialUser
        expect(states[2].isLoading).toBe(false);
        expect(states[2].data).toEqual(initialUser); // success initialUser
        expect(states[3].isLoading).toBe(true);
        expect(states[3].data).toEqual(initialUser); // loading for updatedUser
        expect(states[4].isLoading).toBe(false);
        expect(states[4].data).toEqual(updatedUser); // success updatedUser
        done();
      }
    });

    // 1. Initial fetch (triggered by subscribe since no data)
    // implicit: await qc.refetch(endpointKey);

    // 2. Wait for first fetch to complete, then trigger another
    setTimeout(async () => {
      if (qc.getState(endpointKey).data?.name === initialUser.name) {
        mockFetch(async () => ({ data: updatedUser, status: 200 }));
        await qc.refetch(endpointKey);
      }
    }, 50); // Ensure first fetch cycle completes
  });
});
