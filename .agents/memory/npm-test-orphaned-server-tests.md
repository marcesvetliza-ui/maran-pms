---
name: npm test only runs an explicit allowlist of server tests
description: server-side test files can exist and pass in isolation yet never run as part of the standard test command — verify wiring, not just that a new test passes alone.
---

The project's server-side test runner is wired to an explicit, hand-maintained list of filenames rather than a glob over the whole test directory. A new server test file can be fully correct and passing, yet silently never execute as part of the normal test command unless its path is also added to that allowlist.

**Why:** discovered while adding a regression test for report-filter logic — the obvious place to add the test turned out to be invisible to the standard test run despite living in the conventional test directory.

**How to apply:** after adding any new server-side test file, don't just run it directly and confirm it passes — also run the project's standard test command from a clean state and confirm the new file's assertions actually execute within that run (e.g. by temporarily breaking the assertion and seeing the standard command fail). If it doesn't, the test file needs to be added to whatever allowlist/script wires tests into that command.
