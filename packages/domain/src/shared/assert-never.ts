export const assertNever = (value: never): never => {
  throw new Error(
    `[assertNever] Non-exhaustive match. Unexpected value: ${JSON.stringify(value)}`,
  );
};
