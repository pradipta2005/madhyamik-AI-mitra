# Security Specification — Madhyamik AI Mitra

## 1. Data Invariants
1. **Strict Owner Isolation**: Every user profile (`/users/{userId}`), study session (`/users/{userId}/sessions/{sessionId}`), and message (`/users/{userId}/sessions/{sessionId}/messages/{messageId}`) can only be read, listed, created, updated, or deleted by the verified Google-authenticated user whose `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
2. **Master Gate Integrity**: A `ChatMessage` cannot be created unless its parent `StudySession` document exists and belongs to `request.auth.uid`.
3. **Immutable Ownership & Timestamps**: `uid`, `userId`, `sessionId`, `id`, and `createdAt` can never be mutated after creation. `createdAt` and `updatedAt` must match `request.time`.
4. **Bounded Payloads**: Strings are strictly capped (`title <= 200`, `text <= 40000`, `attachmentSummary <= 2000`), and arrays (`pyqItems <= 15`, `youtubeVideos <= 2`, `groundingLinks <= 10`) are bounded and element-type guarded.
5. **No Shadow Fields**: Every write validates `keys().hasAll(...) && keys().hasOnly(...)` on create and `affectedKeys().hasOnly(...)` on update.

## 2. The "Dirty Dozen" Adversarial Payloads
1. Cross-user read/list of `/users/victimUid/sessions` by another signed-in user -> `PERMISSION_DENIED`.
2. Unverified email spoofing (`email_verified: false`) attempting write to `/users/{uid}` -> `PERMISSION_DENIED`.
3. Shadow field injection (`isAdmin: true` or `role: "admin"`) on `UserProfile` create -> `PERMISSION_DENIED`.
4. Oversized document ID poisoning (`1500` chars or `/users/u1/sessions/bad$id`) -> `PERMISSION_DENIED`.
5. Client-forged `createdAt` timestamp (`new Date(0)`) instead of `request.time` -> `PERMISSION_DENIED`.
6. Mutating `userId` or `createdAt` during `StudySession` update -> `PERMISSION_DENIED`.
7. Orphaned `ChatMessage` write pointing to a non-existent `sessionId` -> `PERMISSION_DENIED`.
8. Spoofing `userId` inside `ChatMessage` to another student's UID -> `PERMISSION_DENIED`.
9. Oversized `text` (`> 40000` chars) resource exhaustion attack -> `PERMISSION_DENIED`.
10. Unbounded array attack (`youtubeVideos` with 10 items instead of max 2, or `pyqItems` > 15) -> `PERMISSION_DENIED`.
11. Invalid `subject` or `role` enum value on `StudySession` or `ChatMessage` -> `PERMISSION_DENIED`.
12. Modifying or deleting an existing `ChatMessage` once persisted -> `PERMISSION_DENIED` (messages are append-only).
