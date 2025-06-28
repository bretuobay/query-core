// tests/runner/testRunner.ts

interface TestResult {
  description: string;
  passed: boolean;
  error?: Error;
  suite: string;
}

interface TestSuite {
  description: string;
  tests: Array<{ description: string; fn: () => Promise<void> | void }>;
  beforeEaches: Array<() => void>;
  afterEaches: Array<() => void>;
}

const suites: TestSuite[] = [];
let currentSuite: TestSuite | null = null;
const results: TestResult[] = [];

export function describe(description: string, suiteFn: () => void): void {
  const newSuite: TestSuite = { description, tests: [], beforeEaches: [], afterEaches: [] };
  suites.push(newSuite);
  currentSuite = newSuite;
  suiteFn();
  currentSuite = null;
}

export function it(description: string, testFn: () => Promise<void> | void): void {
  if (!currentSuite) {
    throw new Error('`it` must be called within a `describe` block.');
  }
  currentSuite.tests.push({ description, fn: testFn });
}

export function beforeEach(fn: () => void): void {
  if (!currentSuite) {
    throw new Error('`beforeEach` must be called within a `describe` block.');
  }
  currentSuite.beforeEaches.push(fn);
}

export function afterEach(fn: () => void): void {
  if (!currentSuite) {
    throw new Error('`afterEach` must be called within a `describe` block.');
  }
  currentSuite.afterEaches.push(fn);
}

// Basic assertion functions
export function expect(actual: any) {
  return {
    toBe: (expected: any) => {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
      }
    },
    toEqual: (expected: any) => {
      // Simple deep equal for plain objects and arrays
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
      }
    },
    toBeTruthy: () => {
      if (!actual) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be truthy`);
      }
    },
    toBeFalsy: () => {
      if (actual) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be falsy`);
      }
    },
    toBeInstanceOf: (expectedConstructor: any) => {
      if (!(actual instanceof expectedConstructor)) {
        throw new Error(`Expected ${actual} to be instance of ${expectedConstructor.name}`);
      }
    },
    toThrow: (expectedError?: string | RegExp | ErrorConstructor) => {
      let thrown = false;
      let thrownError: any;
      try {
        actual(); // actual is expected to be a function that throws
      } catch (e) {
        thrown = true;
        thrownError = e;
      }
      if (!thrown) {
        throw new Error('Expected function to throw an error, but it did not.');
      }
      if (expectedError) {
        if (typeof expectedError === 'string') {
          if (!(thrownError instanceof Error) || !thrownError.message.includes(expectedError)) {
            throw new Error(`Expected error message "${thrownError?.message}" to include "${expectedError}"`);
          }
        } else if (expectedError instanceof RegExp) {
          if (!(thrownError instanceof Error) || !expectedError.test(thrownError.message)) {
            throw new Error(`Expected error message "${thrownError?.message}" to match ${expectedError}`);
          }
        } else if (typeof expectedError === 'function') { // Error constructor
            if (!(thrownError instanceof expectedError)) {
                 throw new Error(`Expected error to be instance of ${expectedError.name}, but got ${thrownError?.constructor?.name}`);
            }
        }
      }
    },
    // Add more assertions as needed: toContain, toHaveLength, etc.
  };
}

function logToBrowser(message: string, color: string = 'black') {
  const resultsDiv = document.getElementById('test-results');
  if (resultsDiv) {
    const p = document.createElement('p');
    p.textContent = message;
    p.style.color = color;
    p.style.margin = '2px 0';
    p.style.fontFamily = 'monospace';
    resultsDiv.appendChild(p);
  } else {
    console.log(message); // Fallback to console
  }
}

export async function runTests(): Promise<TestResult[]> {
  results.length = 0; // Clear previous results

  logToBrowser('Starting tests...', 'blue');

  for (const suite of suites) {
    logToBrowser(`\nSUITE: ${suite.description}`, 'purple');
    currentSuite = suite; // For beforeEach/afterEach context if they use it
    for (const test of suite.tests) {
      let passed = true;
      let error: Error | undefined;
      // Run all beforeEach hooks
      for (const beforeFn of suite.beforeEaches) {
        try {
          beforeFn();
        } catch (e: any) {
           error = new Error(`Error in beforeEach for "${test.description}": ${e.message}`);
           passed = false;
           break;
        }
      }

      if (passed) { // Only run test if beforeEach hooks passed
        try {
          await test.fn(); // Await to handle async tests
        } catch (e: any) {
          passed = false;
          error = e instanceof Error ? e : new Error(String(e));
        }
      }

      // Run all afterEach hooks regardless of test pass/fail, but catch their errors
      for (const afterFn of suite.afterEaches) {
         try {
          afterFn();
        } catch (e: any) {
           if (passed) { // If test passed but afterEach failed, mark test as failed
             error = new Error(`Error in afterEach for "${test.description}": ${e.message}`);
             passed = false;
           } else if (error) { // Append afterEach error to existing test error
             error.message += `\nAND Error in afterEach: ${e.message}`;
           }
        }
      }

      results.push({ description: test.description, passed, error, suite: suite.description });
      if (passed) {
        logToBrowser(`  PASS: ${test.description}`, 'green');
      } else {
        logToBrowser(`  FAIL: ${test.description}`, 'red');
        if (error) {
          logToBrowser(`    Error: ${error.message}`, 'red');
          if (error.stack) {
             error.stack.split('\\n').forEach(line => logToBrowser(`    ${line.trim()}`, 'darkred'));
          }
        }
      }
    }
  }
  currentSuite = null;

  const summary = `\nTests completed. Passed: ${results.filter(r => r.passed).length}, Failed: ${results.filter(r => !r.passed).length}`;
  logToBrowser(summary, results.some(r => !r.passed) ? 'red' : 'green');
  return results;
}
