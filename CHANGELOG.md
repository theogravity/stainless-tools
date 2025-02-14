# stainless-tools changelog

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
