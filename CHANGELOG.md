# stainless-tools changelog

## 3.5.2

### Patch Changes

- [#41](https://github.com/theogravity/stainless-tools/pull/41) [`2849c5a`](https://github.com/theogravity/stainless-tools/commit/2849c5af728eac2a0c5af6f6e82811a412705f8a) Thanks [@theogravity](https://github.com/theogravity)! - Fix an issue where publish runs in a loop after an initial spec / OAI file change

## 3.5.1

### Patch Changes

- [#39](https://github.com/theogravity/stainless-tools/pull/39) [`852d800`](https://github.com/theogravity/stainless-tools/commit/852d8003a431c03eca0cb12c758ed59cdf510088) Thanks [@theogravity](https://github.com/theogravity)! - Add color support to lifecycle output, add color to certain log entries

## 3.5.0

### Minor Changes

- [#37](https://github.com/theogravity/stainless-tools/pull/37) [`f6e4fe5`](https://github.com/theogravity/stainless-tools/commit/f6e4fe57747245525ad1d07b3489ee4f8399f6dd) Thanks [@theogravity](https://github.com/theogravity)! - Add prePublishSpec lifecycle hook

## 3.4.0

### Minor Changes

- [#33](https://github.com/theogravity/stainless-tools/pull/33) [`430be8d`](https://github.com/theogravity/stainless-tools/commit/430be8d8ea06e4d45eb34ec92ee33fea392ad8f0) Thanks [@theogravity](https://github.com/theogravity)! - refactor: move generate code to own file

- [#34](https://github.com/theogravity/stainless-tools/pull/34) [`3543614`](https://github.com/theogravity/stainless-tools/commit/3543614d1d0923dccbf6103b8e3ace1009cd30db) Thanks [@theogravity](https://github.com/theogravity)! - Add publish-specs command

- [#36](https://github.com/theogravity/stainless-tools/pull/36) [`d859ce3`](https://github.com/theogravity/stainless-tools/commit/d859ce3f9f527cb12cc7bb3cb4ef399fd3b5af4d) Thanks [@theogravity](https://github.com/theogravity)! - Make the branch param optional. We will now automatically generate a branch in the format of `cli/<random hash>` if
  none is specified.

### Patch Changes

- [#31](https://github.com/theogravity/stainless-tools/pull/31) [`04464e6`](https://github.com/theogravity/stainless-tools/commit/04464e61fcc7c011ae5c96b3443349025783b656) Thanks [@theogravity](https://github.com/theogravity)! - Log out lifecycle execution failures

- [#35](https://github.com/theogravity/stainless-tools/pull/35) [`1d72b6f`](https://github.com/theogravity/stainless-tools/commit/1d72b6fd0fa242fecf0b08f5d42888d228ea1438) Thanks [@theogravity](https://github.com/theogravity)! - Add more logging around publishing files

## 3.3.3

### Patch Changes

- [#29](https://github.com/theogravity/stainless-tools/pull/29) [`e79cb68`](https://github.com/theogravity/stainless-tools/commit/e79cb6841b4eb94223439a382ef3a167aedf2d1c) Thanks [@theogravity](https://github.com/theogravity)! - Fix lifecycle config not getting passed when using cli

## 3.3.2

### Patch Changes

- [`a13a07e`](https://github.com/theogravity/stainless-tools/commit/a13a07e5cc840cc91b6e005d46072dd662590efd) Thanks [@theogravity](https://github.com/theogravity)! - Fix readme examples

## 3.3.1

### Patch Changes

- [#26](https://github.com/theogravity/stainless-tools/pull/26) [`e8bcfe9`](https://github.com/theogravity/stainless-tools/commit/e8bcfe9711cb25b67dea19654e270f5208f9e088) Thanks [@theogravity](https://github.com/theogravity)! - Add logging for lifecycle methods

## 3.3.0

### Minor Changes

- [#24](https://github.com/theogravity/stainless-tools/pull/24) [`b7e6ba0`](https://github.com/theogravity/stainless-tools/commit/b7e6ba08669c14579925b64b5cbec444359a1b48) Thanks [@theogravity](https://github.com/theogravity)! - Add lifecycle methods

## 3.2.0

### Minor Changes

- [#22](https://github.com/theogravity/stainless-tools/pull/22) [`df9dd0b`](https://github.com/theogravity/stainless-tools/commit/df9dd0b06afcce109912f7ac6cc8954f3635fa23) Thanks [@theogravity](https://github.com/theogravity)! - Remove ESM support. Having issues when running the tool globally.

## 3.1.1

### Patch Changes

- [`adf2c58`](https://github.com/theogravity/stainless-tools/commit/adf2c58ec2d737feafb2e44fe645c47cbc0218c1) Thanks [@theogravity](https://github.com/theogravity)! - Fix issue where STAINLESS_SDK_BRANCH wasn't prioritized properly

## 3.1.0

### Minor Changes

- [`3f51b66`](https://github.com/theogravity/stainless-tools/commit/3f51b66688aa8c8d7aa8ef53e062b5e84cd37d40) Thanks [@theogravity](https://github.com/theogravity)! - Add additional `targetDir` template variables: `{env}` and `{branch}`.

  ### Target Directory Templates

  The `targetDir` configuration supports template variables that are dynamically replaced when generating SDKs:

  - `{sdk}`: Replaced with the name of the SDK being generated
  - `{env}`: Replaced with the current environment (`staging` or `prod`)
  - `{branch}`: Replaced with the git branch name (forward slashes are converted to hyphens for filesystem compatibility)

### Patch Changes

- [#17](https://github.com/theogravity/stainless-tools/pull/17) [`6db01ab`](https://github.com/theogravity/stainless-tools/commit/6db01ab3d14e3e0dc69f4d80c9c4b77409278e0c) Thanks [@theogravity](https://github.com/theogravity)! - Refactor tests

## 3.0.0

### Major Changes

- [#15](https://github.com/theogravity/stainless-tools/pull/15) [`b3d323b`](https://github.com/theogravity/stainless-tools/commit/b3d323b778973cee087783e1bb120495c261e601) Thanks [@theogravity](https://github.com/theogravity)! - Add prod repository support. See MIGRATE.md for more details.

## 2.0.1

### Patch Changes

- [#14](https://github.com/theogravity/stainless-tools/pull/14) [`561a759`](https://github.com/theogravity/stainless-tools/commit/561a759ceb286d926093bc06a6a5d6b54047cf5f) Thanks [@theogravity](https://github.com/theogravity)! - Fixes an issue where the config / openapi publication prints out twice

- [#12](https://github.com/theogravity/stainless-tools/pull/12) [`2959452`](https://github.com/theogravity/stainless-tools/commit/29594528520d00814f536104f4efe0dc194a9c1f) Thanks [@theogravity](https://github.com/theogravity)! - Remote and local repo URI comparision is still too strict. Relaxing to only compare against the `org/repo-name` instead of a full URI

## 2.0.0

### Major Changes

- [#9](https://github.com/theogravity/stainless-tools/pull/9) [`17bf174`](https://github.com/theogravity/stainless-tools/commit/17bf174123ce79765a6315656065fce693edaa1e) Thanks [@theogravity](https://github.com/theogravity)! - Breaking: the config file for stainless-tools is renamed from `stainless` to `stainless-tools`. See `Configuration` in the README for more info

### Patch Changes

- [#11](https://github.com/theogravity/stainless-tools/pull/11) [`4a6f126`](https://github.com/theogravity/stainless-tools/commit/4a6f1265a0f4a6384c25151b6d3efcfe300c7cd8) Thanks [@theogravity](https://github.com/theogravity)! - Fixes an issue where if an sdk is already checked out and the tool is re-executed, the check to see if the sdk repo is cloned from the origin was too strict, preventing the repo from being updated

## 1.1.1

### Patch Changes

- [#7](https://github.com/theogravity/stainless-tools/pull/7) [`009ccce`](https://github.com/theogravity/stainless-tools/commit/009ccceb996ee3301d34a2faeab50cef03e55548) Thanks [@theogravity](https://github.com/theogravity)! - Add support for a `.env.override` file.

## 1.1.0

### Minor Changes

- [#5](https://github.com/theogravity/stainless-tools/pull/5) [`a29fcf8`](https://github.com/theogravity/stainless-tools/commit/a29fcf8ee30a24d10ba87a5dbcf23c00e32787ef) Thanks [@theogravity](https://github.com/theogravity)! - - Add the `STAINLESS_SDK_BRANCH` as an alternative to the config or `--branch` option
  - Consolidate redundant code around Git URI validation
  - Add more code comments for clarity

## 1.0.1

### Patch Changes

- [`85bb0e7`](https://github.com/theogravity/stainless-tools/commit/85bb0e796e6d844ab0d34b79e289f849721cb9bf) Thanks [@theogravity](https://github.com/theogravity)! - Readme updates

## 1.0.0

### Major Changes

- [#1](https://github.com/theogravity/stainless-tools/pull/1) [`ede005d`](https://github.com/theogravity/stainless-tools/commit/ede005d73869d312d75caf8e035726c27bf1115e) Thanks [@theogravity](https://github.com/theogravity)! - First version
