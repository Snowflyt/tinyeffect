// @ts-check

/** @satisfies {import("lint-staged").Config} */
const config = {
  "**/*.{js,ts}":
    "eslint --fix --no-error-on-unmatched-pattern --report-unused-disable-directives-severity error --max-warnings 0",
  "*.{cjs,mjs,cts,mts}":
    "eslint --fix --no-error-on-unmatched-pattern --report-unused-disable-directives-severity error --max-warnings 0",
  "**/*.{json,md}": "prettier --log-level=silent --no-error-on-unmatched-pattern --write",
  ".hintrc": "prettier --log-level=silent --no-error-on-unmatched-pattern --write --parser json",
};

export default config;
