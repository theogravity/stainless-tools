---
"stainless-tools": patch
---

Fixes an issue where if an sdk is already checked out and the tool is re-executed, the check to see if the sdk repo is cloned from the origin was too strict, preventing the repo from being updated
