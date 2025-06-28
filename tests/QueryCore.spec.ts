import QueryCore, { EndpointOptions } from '../src/QueryCore'; // Adjust path as needed
import { describe, it, expect, beforeEach, afterEach } from './runner/testRunner.js';
import { mockFetch, resetFetch, getFetchCalls } from './mocks/mockFetch.js';
import { setupMockLocalStorage, resetMockLocalStorage } from './mocks/mockLocalStorage.js';
import {
  setupMockIndexedDB,
  resetMockIndexedDB,
  getMockIndexedDBStore,
  setMockIndexedDBStore,
  setMockIndexedDBShouldFail,
} from './mocks/mockIndexedDB.js';

describe('QueryCore - Endpoint Definition and Configuration', () => {
  let qc: QueryCore;

  beforeEach(() => {
    // Default setup for most tests in this suite
    setupMockLocalStorage();
    setupMockIndexedDB(); // Even if not used by all, good to have a clean slate
    mockFetch(); // Basic mock fetch that does nothing unless overridden in a test
  });

  afterEach(() => {
    resetFetch();
    resetMockLocalStorage();
    resetMockIndexedDB();
  });

  it('should define an endpoint with default options', async () => {
    qc = new QueryCore();
    const fetcher = async () => ({ message: 'success' });
    await qc.defineEndpoint('testEndpoint', fetcher);

    const endpointState = qc.getState('testEndpoint');
    expect(endpointState).toBeTruthy();
    expect(endpointState.data).toBe(undefined); // No fetch yet, cache miss
    // @ts-ignore - accessing private member for test verification
    const endpointDefinition = qc.endpoints.get('testEndpoint');
    expect(endpointDefinition).toBeTruthy();
    expect(endpointDefinition.fetcher).toBe(fetcher);
    expect(endpointDefinition.options.cacheProvider).toBe(undefined); // Uses global default
    expect(endpointDefinition.options.refetchAfter).toBe(undefined);
  });

  it('should define an endpoint with custom options', async () => {
    qc = new QueryCore({ defaultRefetchAfter: 10000 });
    const fetcher = async () => ({ message: 'success' });
    const endpointOptions: EndpointOptions = {
      refetchAfter: 5000,
      cacheProvider: 'indexedDB',
    };
    await qc.defineEndpoint('customEndpoint', fetcher, endpointOptions);

    // @ts-ignore
    const endpointDefinition = qc.endpoints.get('customEndpoint');
    expect(endpointDefinition).toBeTruthy();
    expect(endpointDefinition.options.refetchAfter).toBe(5000); // Custom overrides global
    expect(endpointDefinition.options.cacheProvider).toBe('indexedDB');
    // @ts-ignore
    expect(
      endpointDefinition.cache instanceof (await import('./mocks/mockIndexedDB.js')).MockIndexedDBCacheProvider,
    ).toBeFalsy(); // This needs to be more specific to the actual class from the source if possible, or check type
  });

  it('should use global cacheProvider if endpoint-specific one is not provided', async () => {
    qc = new QueryCore({ cacheProvider: 'indexedDB' });
    const fetcher = async () => ({ id: 1 });
    await qc.defineEndpoint('ep1', fetcher);

    // @ts-ignore
    const endpointDefinition = qc.endpoints.get('ep1');
    expect(endpointDefinition).toBeTruthy();
    // @ts-ignore
    const cacheInstance = endpointDefinition.cache;
    // This is a bit of a hacky way to check instance type due to dynamic imports and mock structure
    // A better way would be to expose the actual provider type from QueryCore or have a type property on the mock
    const { IndexedDBCacheProvider } = await import('../src/cacheProviders/IndexedDBCacheProvider.js');
    expect(cacheInstance instanceof IndexedDBCacheProvider).toBeTruthy();
  });

  it('should allow overriding global QueryCoreOptions at endpoint definition', async () => {
    qc = new QueryCore({ cacheProvider: 'localStorage', defaultRefetchAfter: 60000 });
    const fetcher = async () => 'data';
    await qc.defineEndpoint('epSpecific', fetcher, { cacheProvider: 'indexedDB', refetchAfter: 10000 });

    // @ts-ignore
    const epDef = qc.endpoints.get('epSpecific');
    expect(epDef.options.refetchAfter).toBe(10000);
    const { IndexedDBCacheProvider } = await import('../src/cacheProviders/IndexedDBCacheProvider.js');
    expect(epDef.cache instanceof IndexedDBCacheProvider).toBeTruthy();
  });
});

describe('QueryCore - Fetcher Invocation and Promise Handling', () => {
  let qc: QueryCore;

  beforeEach(() => {
    setupMockLocalStorage();
    setupMockIndexedDB();
    // mockFetch is setup per test or with a default here
  });

  afterEach(() => {
    resetFetch();
    resetMockLocalStorage();
    resetMockIndexedDB();
  });

  it('should call the fetcher function on refetch', async () => {
    const mockData = { id: 1, text: 'todo item' };
    let fetcherCalled = false;
    const fetcher = async () => {
      fetcherCalled = true;
      return mockData;
    };

    mockFetch(() => ({ data: mockData, status: 200 })); // Mock global fetch, though QueryCore uses the passed fetcher directly

    qc = new QueryCore();
    await qc.defineEndpoint('todos', fetcher);
    await qc.refetch('todos');

    expect(fetcherCalled).toBeTruthy();
    const state = qc.getState('todos');
    expect(state.data).toEqual(mockData);
    expect(state.isLoading).toBe(false);
    expect(state.isError).toBe(false);
    expect(state.lastUpdated).toBeTruthy();
  });

  it('should handle fetcher promise rejection and set error state', async () => {
    const errorMessage = 'Network Error';
    const fetcher = async () => {
      throw new Error(errorMessage);
    };

    qc = new QueryCore();
    await qc.defineEndpoint('errorEndpoint', fetcher);
    await qc.refetch('errorEndpoint');

    const state = qc.getState('errorEndpoint');
    expect(state.data).toBe(undefined);
    expect(state.isLoading).toBe(false);
    expect(state.isError).toBeTruthy();
    expect(state.error).toBeInstanceOf(Error);
    expect(state.error.message).toBe(errorMessage);
    expect(state.lastUpdated).toBe(undefined); // lastUpdated only on successful fetch
  });

  it('should set isLoading state during fetch operation', async () => {
    const mockData = { value: 'test' };
    let resolveFetch: (value: unknown) => void;
    const fetchingPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });

    const fetcher = async () => {
      await fetchingPromise;
      return mockData;
    };

    qc = new QueryCore();
    await qc.defineEndpoint('loadingTest', fetcher);

    let loadingStateNotified = false;
    qc.subscribe('loadingTest', (state) => {
      if (state.isLoading) {
        loadingStateNotified = true;
      }
    });

    const refetchPromise = qc.refetch('loadingTest'); // Don't await here to check intermediate state

    expect(qc.getState('loadingTest').isLoading).toBeTruthy();
    expect(loadingStateNotified).toBeTruthy(); // Subscriber should have been notified of loading:true

    // @ts-ignore
    resolveFetch(mockData); // Now resolve the fetcher's promise
    await refetchPromise; // Wait for refetch to complete

    expect(qc.getState('loadingTest').isLoading).toBe(false);
    expect(qc.getState('loadingTest').data).toEqual(mockData);
  });
});

describe('QueryCore - Caching (LocalStorage)', () => {
  let qc: QueryCore;
  const endpointKey = 'localStorageTest';
  const mockData = { message: 'cached in LS' };

  beforeEach(async () => {
    setupMockLocalStorage();
    // No mockFetch needed if we're just testing cache loading/saving around manual sets
    qc = new QueryCore({ cacheProvider: 'localStorage' }); // Explicitly use LS
    // Define endpoint, but don't fetch initially for some tests
    await qc.defineEndpoint(endpointKey, async () => mockData);
  });

  afterEach(() => {
    resetMockLocalStorage();
    resetFetch(); // Just in case
  });

  it('should load initial data from LocalStorage if available', async () => {
    // Pre-populate mock LocalStorage
    const cacheKey = `QueryCore_${endpointKey}`; // As per LocalStorageCacheProvider prefix
    localStorage.setItem(cacheKey, JSON.stringify({ data: mockData, lastUpdated: Date.now() - 1000 }));

    // Re-define endpoint to trigger cache load
    const newQc = new QueryCore({ cacheProvider: 'localStorage' });
    await newQc.defineEndpoint(endpointKey, async () => ({ message: 'new data' }));

    const state = newQc.getState(endpointKey);
    expect(state.data).toEqual(mockData);
    expect(state.lastUpdated).toBeTruthy();
  });

  it('should save data to LocalStorage on successful fetch', async () => {
    mockFetch(() => ({ data: mockData, status: 200 }));
    await qc.refetch(endpointKey); // This will fetch and then save

    const state = qc.getState(endpointKey);
    expect(state.data).toEqual(mockData);

    const cachedRaw = localStorage.getItem(`QueryCore_${endpointKey}`);
    expect(cachedRaw).toBeTruthy();
    const cachedItem = JSON.parse(cachedRaw!);
    expect(cachedItem.data).toEqual(mockData);
    expect(cachedItem.lastUpdated).toBe(state.lastUpdated);
  });

  it('should remove data from LocalStorage on invalidate', async () => {
    // First, populate the cache
    mockFetch(() => ({ data: mockData, status: 200 }));
    await qc.refetch(endpointKey);
    expect(localStorage.getItem(`QueryCore_${endpointKey}`)).toBeTruthy();

    await qc.invalidate(endpointKey);
    expect(localStorage.getItem(`QueryCore_${endpointKey}`)).toBe(null);
    const state = qc.getState(endpointKey);
    expect(state.data).toBe(undefined);
    expect(state.lastUpdated).toBe(undefined);
  });
});

describe('QueryCore - Caching (IndexedDB)', () => {
  let qc: QueryCore;
  const endpointKey = 'indexedDBTest';
  const mockData = { message: 'cached in IDB' };

  beforeEach(async () => {
    setupMockIndexedDB();
    // No mockFetch needed if we're just testing cache loading/saving around manual sets
    qc = new QueryCore({ cacheProvider: 'indexedDB' });
    await qc.defineEndpoint(endpointKey, async () => mockData);
  });

  afterEach(() => {
    resetMockIndexedDB();
    resetFetch();
  });

  it('should load initial data from IndexedDB if available', async () => {
    // Pre-populate mock IndexedDB
    const itemToStore = { key: endpointKey, value: { data: mockData, lastUpdated: Date.now() - 1000 } };
    setMockIndexedDBStore({ [endpointKey]: itemToStore }); // Use mock helper

    const newQc = new QueryCore({ cacheProvider: 'indexedDB' });
    await newQc.defineEndpoint(endpointKey, async () => ({ message: 'new data' }));

    const state = newQc.getState(endpointKey);
    expect(state.data).toEqual(mockData);
    expect(state.lastUpdated).toBeTruthy();
  });

  it('should save data to IndexedDB on successful fetch', async () => {
    mockFetch(() => ({ data: mockData, status: 200 }));
    await qc.refetch(endpointKey);

    const state = qc.getState(endpointKey);
    expect(state.data).toEqual(mockData);

    const mockStore = getMockIndexedDBStore();
    expect(mockStore[endpointKey]).toBeTruthy();
    expect(mockStore[endpointKey].value.data).toEqual(mockData);
    expect(mockStore[endpointKey].value.lastUpdated).toBe(state.lastUpdated);
  });

  it('should remove data from IndexedDB on invalidate', async () => {
    mockFetch(() => ({ data: mockData, status: 200 }));
    await qc.refetch(endpointKey); // Populate cache
    expect(getMockIndexedDBStore()[endpointKey]).toBeTruthy();

    await qc.invalidate(endpointKey);
    expect(getMockIndexedDBStore()[endpointKey]).toBe(undefined);
    const state = qc.getState(endpointKey);
    expect(state.data).toBe(undefined);
    expect(state.lastUpdated).toBe(undefined);
  });

  it('should handle IndexedDB get returning undefined (cache miss)', async () => {
    // Ensure store is empty for this key
    const currentStore = getMockIndexedDBStore();
    delete currentStore[endpointKey];
    setMockIndexedDBStore(currentStore);

    // Re-define to trigger cache load attempt
    const newQc = new QueryCore({ cacheProvider: 'indexedDB' });
    await newQc.defineEndpoint(endpointKey, async () => mockData);
    const state = newQc.getState(endpointKey);
    expect(state.data).toBe(undefined); // Cache miss
  });

  it('should handle IndexedDB set failure gracefully (e.g. if mock is set to fail)', async () => {
    setMockIndexedDBShouldFail(true); // Configure mock to make DB operations fail
    mockFetch(() => ({ data: mockData, status: 200 }));

    await qc.refetch(endpointKey); // Attempt to fetch and save, save should "fail" in mock

    const state = qc.getState(endpointKey);
    // Data should still be in memory state due to successful fetch,
    // even if cache write failed.
    expect(state.data).toEqual(mockData);
    expect(state.isError).toBe(false); // Fetch itself was fine

    // Check that data wasn't actually written to the (mock) store
    setMockIndexedDBShouldFail(false); // Reset fail state for verification
    const store = getMockIndexedDBStore();
    expect(store[endpointKey]).toBe(undefined); // Or how your mock handles failed writes

    setMockIndexedDBShouldFail(false); // cleanup
  });
});

describe('QueryCore - State Management and Subscription', () => {
  let qc: QueryCore;
  const endpointKey = 'stateTest';
  const initialData = { version: 1 };
  const updatedData = { version: 2 };

  beforeEach(async () => {
    setupMockLocalStorage(); // Use LS for these tests for simplicity unless IDB specific
    setupMockIndexedDB();
    qc = new QueryCore();
    // Define an endpoint that can be controlled by mockFetch
    await qc.defineEndpoint(endpointKey, async () => updatedData);
  });

  afterEach(() => {
    resetMockLocalStorage();
    resetMockIndexedDB();
    resetFetch();
  });

  it('should provide initial state to subscriber immediately', (done) => {
    // Mock initial cache state
    const cacheKey = `QueryCore_${endpointKey}`;
    localStorage.setItem(cacheKey, JSON.stringify({ data: initialData, lastUpdated: Date.now() }));

    // Re-initialize QueryCore and define endpoint to load from cache
    qc = new QueryCore(); // fresh instance
    qc.defineEndpoint(endpointKey, async () => updatedData).then(() => {
      qc.subscribe(endpointKey, (state) => {
        expect(state.data).toEqual(initialData);
        expect(state.isLoading).toBe(false);
        expect(state.isError).toBe(false);
        done(); // End test after first callback
      });
    });
  });

  it('should notify subscribers on successful fetch', (done) => {
    mockFetch(() => ({ data: updatedData, status: 200 }));

    let callCount = 0;
    qc.subscribe(endpointKey, (state) => {
      callCount++;
      if (callCount === 1) {
        // Initial state (empty or from cache - likely empty here)
        expect(state.isLoading).toBe(false); // or true if fetch is immediate from define
      } else if (callCount === 2) {
        // Loading state
        expect(state.isLoading).toBeTruthy();
        expect(state.data).toBe(undefined); // Or previous data if cache existed
      } else if (callCount === 3) {
        // Success state
        expect(state.isLoading).toBe(false);
        expect(state.isError).toBe(false);
        expect(state.data).toEqual(updatedData);
        expect(state.lastUpdated).toBeTruthy();
        done();
      }
    });
    qc.refetch(endpointKey);
  });

  it('should notify subscribers on fetch error', (done) => {
    const errorMessage = 'Fetch failed';
    mockFetch(() => {
      throw new Error(errorMessage);
    }); // Make fetcher throw

    // Need to redefine endpoint with a fetcher that uses the global mockFetch
    // Or, ensure the original fetcher for 'stateTest' in beforeEach will throw.
    // For simplicity, let's assume the default fetcher in beforeEach is sufficient if mockFetch is set to throw.
    // The fetcher in defineEndpoint is async () => updatedData. This doesn't use global fetch.
    // Let's redefine for this test.
    qc = new QueryCore(); // New instance
    const errorFetcher = async () => {
      // This fetcher will be called by QueryCore's refetch
      // It needs to simulate what mockFetch would do if it were global fetch
      const response = await window.fetch('test_url'); // This call will be intercepted by mockFetch
      if (!response.ok) throw new Error(await response.json()); // or similar error handling
      return response.json();
    };
    qc.defineEndpoint(endpointKey, errorFetcher);

    let callCount = 0;
    qc.subscribe(endpointKey, (state) => {
      callCount++;
      if (callCount === 2) {
        // Loading state
        expect(state.isLoading).toBeTruthy();
      } else if (callCount === 3) {
        // Error state
        expect(state.isLoading).toBe(false);
        expect(state.isError).toBeTruthy();
        expect(state.error).toBeInstanceOf(Error);
        // The error message might be complex if it's from a mocked Response.json()
        // For this mock, errorFetcher throws directly.
        // If mockFetch throws an error object, it should be caught by QueryCore.
        // QueryCore's refetch catches error and sets state.error = error.
        // Let's adjust mockFetch to simulate this for errorFetcher.
        // The error message from mockFetch when it throws is just the string.
        // The error object caught by QueryCore will be `new Error("Fetch failed")`.
        expect(state.error.message).toBe(errorMessage);
        done();
      }
    });

    // Adjust mockFetch to throw an error that will be caught by errorFetcher
    mockFetch(async () => {
      throw new Error(errorMessage);
    });

    qc.refetch(endpointKey);
  });

  it('unsubscribe should prevent further notifications', async () => {
    mockFetch(() => ({ data: updatedData, status: 200 }));
    let callCount = 0;
    const unsubscribe = qc.subscribe(endpointKey, (state) => {
      callCount++;
    });

    await qc.refetch(endpointKey); // Should trigger notifications
    expect(callCount).toBeGreaterThan(1); // Initial, loading, success

    unsubscribe();
    const previousCallCount = callCount;

    await qc.refetch(endpointKey); // Another refetch
    expect(callCount).toBe(previousCallCount); // No new notifications
  });

  it('getState should return current state without subscribing', async () => {
    mockFetch(() => ({ data: initialData, status: 200 }));
    await qc.refetch(endpointKey);

    const state = qc.getState(endpointKey);
    expect(state.data).toEqual(initialData);
    expect(state.isLoading).toBe(false);
    expect(state.lastUpdated).toBeTruthy();
  });

  it('subscribers should receive a copy of the state, not a direct reference', (done) => {
    mockFetch(() => ({ data: { deep: { value: 1 } }, status: 200 }));

    qc.subscribe(endpointKey, (state) => {
      if (state.data && state.data.deep) {
        expect(state.data).toEqual({ deep: { value: 1 } });
        // Attempt to mutate received state
        state.data.deep.value = 2;

        // Get state again, should be original
        const freshState = qc.getState(endpointKey);
        expect(freshState.data.deep.value).toBe(1);
        done();
      }
    });
    qc.refetch(endpointKey);
  });
});

describe('QueryCore - Automatic Refetching Mechanisms', () => {
  let qc: QueryCore;
  const endpointKey = 'autoRefetchTest';
  const initialData = { value: 'initial' };
  const newData = { value: 'new' };

  beforeEach(async () => {
    setupMockLocalStorage();
    setupMockIndexedDB(); // Though not primary, good to have clean.
    mockFetch(() => ({ data: newData, status: 200 })); // Default fetch response

    // To control time for refetchAfter
    // @ts-ignore
    globalThis.Date.now = vi.fn(); // Requires Vitest or similar for vi, or a manual Date mock
    // Manual Date mock for custom runner:
    let currentTime = 1000000000000; // A fixed start time
    const originalDateNow = Date.now;
    globalThis.Date.now = () => currentTime;
    globalThis.advanceTime = (ms: number) => {
      currentTime += ms;
    };
    globalThis.resetTime = () => {
      currentTime = 1000000000000;
      Date.now = originalDateNow; // Restore original Date.now
    };

    qc = new QueryCore();
  });

  afterEach(() => {
    resetFetch();
    resetMockLocalStorage();
    resetMockIndexedDB();
    // @ts-ignore
    globalThis.resetTime(); // Restore Date.now
    // Clear any global event listeners QueryCore might have set up
    // This is tricky without direct access or a cleanup method in QueryCore.
    // For now, assume tests don't interfere badly or QueryCore handles re-adding.
    // A proper QueryCore instance might need a .destroy() method for tests.
  });

  it('should refetch on subscribe if data is stale (refetchAfter)', async (done) => {
    const refetchAfterMs = 100;
    // 1. Define endpoint and populate cache with old data
    // @ts-ignore
    Date.now = () => 1000000000000; // Initial time for cache set
    localStorage.setItem(`QueryCore_${endpointKey}`, JSON.stringify({ data: initialData, lastUpdated: Date.now() }));

    qc = new QueryCore(); // New instance to load from cache
    await qc.defineEndpoint(endpointKey, async () => newData, { refetchAfter: refetchAfterMs });

    // 2. Advance time to make data stale
    // @ts-ignore
    Date.now = () => 1000000000000 + refetchAfterMs + 1;

    let callCount = 0;
    const fetchCallsBeforeSubscribe = getFetchCalls().length;

    qc.subscribe(endpointKey, (state) => {
      callCount++;
      if (callCount === 1) {
        // Initial state from stale cache
        expect(state.data).toEqual(initialData);
      } else if (callCount === 2 && state.isLoading) {
        // Loading state due to stale data
        expect(getFetchCalls().length).toBe(fetchCallsBeforeSubscribe + 1); // Fetch triggered
      } else if (callCount === 3 && !state.isLoading && !state.isError) {
        // Updated state
        expect(state.data).toEqual(newData);
        done();
      }
    });
  });

  it('should refetch on window focus if observed and stale', async () => {
    const refetchAfterMs = 1000;
    await qc.defineEndpoint(endpointKey, async () => newData, { refetchAfter: refetchAfterMs });

    // Initial fetch to populate lastUpdated
    // @ts-ignore
    globalThis.Date.now = () => 1000000000000;
    await qc.refetch(endpointKey); // forceRefetch = true by default if no data
    expect(qc.getState(endpointKey).data).toEqual(newData);
    const firstFetchTime = qc.getState(endpointKey).lastUpdated;

    // Subscribe to make it "observed"
    let focusRefetchData: any;
    qc.subscribe(endpointKey, (state) => {
      if (state.data?.value === 'new_focused_data') focusRefetchData = state.data;
    });

    // Advance time but not enough to be stale for normal refetchAfter
    // @ts-ignore
    globalThis.Date.now = () => firstFetchTime + refetchAfterMs / 2;

    // Simulate window focus
    mockFetch(() => ({ data: { value: 'new_focused_data' }, status: 200 })); // New data for this fetch
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Wait for potential async operations from refetch triggered by event
    await new Promise((r) => setTimeout(r, 50)); // Small delay for event loop / async refetch

    // It should NOT refetch because data is not stale according to refetchAfter
    expect(focusRefetchData).toBe(undefined);
    expect(qc.getState(endpointKey).lastUpdated).toBe(firstFetchTime); // lastUpdated should not change

    // Now make data stale
    // @ts-ignore
    globalThis.Date.now = () => firstFetchTime + refetchAfterMs + 1;
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 50));

    expect(focusRefetchData).toEqual({ value: 'new_focused_data' });
    expect(qc.getState(endpointKey).lastUpdated).toBeGreaterThan(firstFetchTime);

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); // cleanup
  });

  it('should refetch on network reconnect if observed (forced)', async () => {
    await qc.defineEndpoint(endpointKey, async () => newData, { refetchAfter: 100000 }); // Long refetchAfter

    // Initial fetch
    // @ts-ignore
    globalThis.Date.now = () => 1000000000000;
    await qc.refetch(endpointKey);
    const firstFetchTime = qc.getState(endpointKey).lastUpdated;

    let onlineRefetchData: any;
    qc.subscribe(endpointKey, (state) => {
      if (state.data?.value === 'new_online_data') onlineRefetchData = state.data;
    });

    // Data is fresh, but network reconnect should force refetch
    mockFetch(() => ({ data: { value: 'new_online_data' }, status: 200 }));
    window.dispatchEvent(new Event('online'));

    await new Promise((r) => setTimeout(r, 50));

    expect(onlineRefetchData).toEqual({ value: 'new_online_data' });
    expect(qc.getState(endpointKey).lastUpdated).toBeGreaterThan(firstFetchTime);
  });

  it('should NOT refetch on subscribe if data is fresh', async () => {
    const refetchAfterMs = 1000;
    // @ts-ignore
    globalThis.Date.now = () => 1000000000000; // Initial time for cache set
    localStorage.setItem(`QueryCore_${endpointKey}`, JSON.stringify({ data: initialData, lastUpdated: Date.now() }));

    qc = new QueryCore();
    await qc.defineEndpoint(endpointKey, async () => newData, { refetchAfter: refetchAfterMs });

    // @ts-ignore
    globalThis.Date.now = () => 1000000000000 + refetchAfterMs / 2; // Data is fresh

    const fetchCallsBeforeSubscribe = getFetchCalls().length;
    let wasLoading = false;

    qc.subscribe(endpointKey, (state) => {
      if (state.isLoading) wasLoading = true;
      expect(state.data).toEqual(initialData); // Should only receive cached data
    });

    await new Promise((r) => setTimeout(r, 10)); // allow microtasks to run

    expect(getFetchCalls().length).toBe(fetchCallsBeforeSubscribe); // No new fetch
    expect(wasLoading).toBe(false); // Should not have entered loading state
  });
});
