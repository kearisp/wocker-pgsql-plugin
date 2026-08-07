import type {Config} from "@jest/types";


const config: Config.InitialOptionsWithRootDir = {
    clearMocks: false,
    collectCoverage: false,
    collectCoverageFrom: [
        "src/**/*.{js,ts}"
    ],
    coverageDirectory: "coverage",
    coveragePathIgnorePatterns: [
        "src/index\\.ts"
    ],
    coverageReporters: [
        "text-summary",
        "lcovonly",
        "json-summary",
        "html"
    ],
    preset: "ts-jest",
    rootDir: __dirname,
    roots: [
        "<rootDir>/src"
    ],
    transform: {
        "^.+\\.(t|j)s$": "ts-jest"
    },
    testMatch: [
        "<rootDir>/**/?(*.)+(spec|test).[tj]s?(x)"
    ],
    watchman: true
};


export default config;
