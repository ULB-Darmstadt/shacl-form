module.exports = {
    root: true,
    env: {
        browser: true,
        es2020: true,
        node: true
    },
    parser: "@typescript-eslint/parser",
    parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
    },
    plugins: ["@typescript-eslint"],
    extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
    ignorePatterns: ["dist/", "node_modules/"],
    "rules": {
        "no-multi-spaces": "error",
        "no-trailing-spaces": "error",
        "@typescript-eslint/no-unused-vars": [
            "error", { 
                "argsIgnorePattern": "^_", 
                "varsIgnorePattern": "^_",
                "caughtErrorsIgnorePattern": "^_"
            }
        ]
    }
};
