---
"stainless-tools": minor
---

Add additional `targetDir` template variables: `{env}` and `{branch}`.

### Target Directory Templates

The `targetDir` configuration supports template variables that are dynamically replaced when generating SDKs:

- `{sdk}`: Replaced with the name of the SDK being generated
- `{env}`: Replaced with the current environment (`staging` or `prod`)
- `{branch}`: Replaced with the git branch name (forward slashes are converted to hyphens for filesystem compatibility)