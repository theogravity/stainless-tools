import "vitest-fetch-mock";
declare namespace NodeJS {
  interface Global {
    fetchMock: any;
  }
}
