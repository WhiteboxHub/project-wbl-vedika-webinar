# Desktop Client

This app is the installable macOS/Windows client.

## Responsibilities

- Open invite links.
- Authenticate attendee or instructor.
- Join LiveKit room.
- Render video grid.
- Support instructor screen share.
- Support attendee chat.
- Show connection quality.
- Handle reconnects.
- Enforce attendee/instructor permissions.

## Tech

- Tauri
- React
- TypeScript
- Rust
- LiveKit client SDK

## Rules

- Keep native code minimal.
- Put UI state in React.
- Put OS integration in Tauri commands.
- Never store long-lived secrets on disk.
- Do not log tokens.
- Treat network disconnect as normal behavior.
- Every user-visible error needs a recovery path.

## MVP screens

- Download/install landing handoff
- Join class
- Waiting room
- Live classroom
- Reconnecting
- Class ended
- Recording unavailable/error

## Testing

Add tests for:

- invite token parsing
- role-based UI permissions
- reconnect state machine
- chat message rendering
- class ended flow