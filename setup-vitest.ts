import createFetchMock from 'vitest-fetch-mock';
import { vi, beforeEach } from 'vitest';

const fetchMock = createFetchMock(vi);
fetchMock.enableMocks();

// This will ensure fetch is mocked for all tests
beforeEach(() => {
  fetchMock.resetMocks();
}); 