# devnotes - the project's working memory

So that work picks up where it stopped - in the next session, or on another
computer - without repeating what already failed.

| File | What it holds | When it changes |
|---|---|---|
| [STATE.md](STATE.md) | Where things stand now, and what to do next. | Rewritten whenever that changes. |
| [LESSONS.md](LESSONS.md) | Every approach that failed or misled, why, and what works instead. | A line added whenever something fails. Never deleted. |
| [TESTLOG.md](TESTLOG.md) | What was checked, dated, and how. | An entry for every check that matters. |

## The routine

**Starting:** read `STATE.md`, then the parts of `LESSONS.md` that touch the
task, *before* trying anything: if it failed before, the reason is there.

**Working:** when a step fails - a build, a deploy, a guess that turned out
wrong - add it to `LESSONS.md` at once, with what was seen and what worked
instead. When something is verified, log it in `TESTLOG.md`.

**Stopping:** bring `STATE.md` up to date - what is done, what is half-done,
what is next - and commit `devnotes/` with the work.

## What does not go here

This repository is public. No names, addresses, network names, accounts,
PINs or anything else personal: it is "the maintainer's laptop" and "the
phone". Details like those stay in the maintainer's private notes.
