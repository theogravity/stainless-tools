# Upgrading stainless-tools

## Migrating from v2 to v3

Version 3 introduces separate staging and production URLs. Here's how to update your config:

### Before (v2)
```json
{
  "stainlessSdkRepos": {
    "typescript": "git@github.com:stainless-sdks/test-typescript.git",
    "python": "git@github.com:stainless-sdks/test-python.git"
  }
}
```

### After (v3)
```json
{
  "stainlessSdkRepos": {
    "typescript": {
      "staging": "git@github.com:stainless-sdks/test-typescript.git",
      "prod": "git@github.com:test-org/test-typescript.git"
    },
    "python": {
      "staging": "git@github.com:stainless-sdks/test-python.git",
      "prod": "git@github.com:test-org/test-python.git"
    }
  }
}
```

Use `--prod` flag to use production URLs, otherwise staging URLs are used by default.

## Migrating from v1 to v2

The `stainless-tools` config file has been renamed from `stainless` to `stainless-tools`. So if you have a `stainless.config.js` (and related) file, rename it to `stainless-tools.config.js`.