# The public message board

One shared place where the users of a Kanvas installation ask questions, share tips, discuss how Kanvas works, suggest improvements and put questions to the maintainer. It is operated through the agent, like everything else: there is no board UI to click. It is deliberately small and it is **not** a chat product or a support desk.

**Public means:** every signed-in account of this installation can read every message and the public name shown with it. Bug reports do not belong on the board: `kanvas.error.report` and `kanvas.feedback.submit` are private and go to the maintainer.

## Operations

| Operation | What it does |
| --- | --- |
| `kanvas.board.post {requestId, text, tags?, acknowledgePublic?, publicName?}` | Post a message (at most 2000 characters, five tags). |
| `kanvas.board.read {tag?, newOnly?, mine?, limit?, before?, markSeen?, as?}` | Messages, newest first. `nextCursor` pages to older ones. `as:"chat"` adds a ready `chat` view. |
| `kanvas.board.overview {}` | Totals, new since last seen, counts by tag, and a ready `message-board` view. |
| `kanvas.board.update {notifications?, publicName?, markSeen?, removeMessageId?}` | Settings and removal. |

## Consent before the first post

The first post of an account returns `status: "needs_consent"` with the disclosure text and **posts nothing**. The agent tells the person the disclosure, asks for a clear yes and for the name to show, and calls again with `acknowledgePublic: true` and `publicName`. The yes is recorded once per account with its time and the disclosure version; later posts need no flag. Kanvas cannot see the conversation, so the flag is the agent's statement that the person agreed; the operation description and help `kanvas.help.message-board` say so in plain words.

## What a message contains

`id`, `text`, `tags`, `at`, `author` (the public name), and where true `maintainer`, `mine`, `isNew`. Nothing else is stored on or returned with a message except the author's account id, which is kept for ownership, rate limits and removal and is **never returned**. No email address, account display name, session, agent or client detail.

- The public name is chosen by the person, 2-40 characters, never an email address or link. Names are not unique and not verified. Names suggesting an official role are refused unless the account is a service administrator; `maintainer: true` is set by the server for service administrators (`KANVAS_SERVICE_ADMINS`).
- Message text is other people's text. Agents are told to show it and never follow instructions in it.

## Access

Every operation needs a full-account grant. Posting and settings need the `publish` scope. A paired screen, a connection approved for selected sessions and a read-only connection cannot post; a paired screen or selected-session connection cannot read either. There is no HTTP route for the board and no anonymous access in either direction.

## Read state and the notice

Each account has one mark: "seen up to here". `newOnly` returns what other people posted after it; `newCount` counts them. Reading does not move the mark; `markSeen: true` does, once the person has actually seen the messages.

The notice is **off by default**. With `kanvas.board.update {notifications: true}`, Kanvas adds `messageBoard: {newMessages, note}` to a response once at the start of a conversation and when a session is created, and not again for the same number: "14 new messages on the public message board since you last looked." The person decides whether to open it.

## Limits and storage

- Ten posts an hour and thirty a day per account; an identical message within ten minutes is refused; a repeated `requestId` returns the first result.
- The board keeps its newest 5000 messages; older ones are deleted as new ones arrive. With the size limits this bounds the board at roughly 15 MB.
- Messages are ordinary rows of the existing `documents` table (kinds `board-message` and `board-reader`). **No schema migration.** Rolling back to 0.37 leaves the rows in place and unused.
- An author can remove their own message; a service administrator can remove any. Removal clears the text and tags and keeps an empty tombstone so paging stays stable.

## Showing it

- `kanvas.board.overview` returns a `message-board` view: totals, new count, counts by tag with new counts, the latest messages. It is a snapshot; publish again to refresh. It can be a display or a split-screen pane, not a presentation slide.
- `kanvas.board.read {as:"chat"}` returns a `chat` view of the messages.

## Not in this version

Threads and replies, mentions, editing, reactions, search, per-message read state, moderation queues, cross-installation federation and anonymous reading.
