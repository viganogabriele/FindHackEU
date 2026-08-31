import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // eslint-plugin-react's "detect" React version resolver calls the
    // deprecated `context.getFilename()` API, which ESLint 10 no longer
    // exposes on rule contexts and crashes with
    // "contextOrFilename.getFilename is not a function". Pin the version
    // explicitly so eslint-plugin-react skips detection entirely.
    settings: {
      react: {
        version: "19.2.6",
      },
    },
  },
];

export default eslintConfig;
