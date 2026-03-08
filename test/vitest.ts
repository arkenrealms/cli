import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
  test,
} from '@jest/globals';

export { afterEach, beforeEach, describe, expect, it, jest, test };

export const vi = {
  clearAllMocks: jest.clearAllMocks.bind(jest),
  fn: jest.fn.bind(jest),
  resetModules: jest.resetModules.bind(jest),
  restoreAllMocks: jest.restoreAllMocks.bind(jest),
  spyOn: jest.spyOn.bind(jest),
};
