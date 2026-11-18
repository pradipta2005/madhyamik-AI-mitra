import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesContent = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');

test('firestore.rules includes global default-deny catch-all and Eight Pillars guards', () => {
  assert.ok(rulesContent.includes('match /{document=**} {\n      allow read, write: if false;'));
  assert.ok(rulesContent.includes('request.auth.token.email_verified == true'));
  assert.ok(rulesContent.includes('isValidUserProfile'));
  assert.ok(rulesContent.includes('isValidStudySession'));
  assert.ok(rulesContent.includes('isValidChatMessage'));
  assert.ok(rulesContent.includes('existsAfter(/databases/$(database)/documents/users/$(userId)/sessions/$(sessionId))'));
  assert.ok(rulesContent.includes('data.youtubeVideos.size() <= 2'));
  assert.ok(rulesContent.includes('data.pyqItems.size() <= 15'));
  assert.ok(rulesContent.includes('resource.data.userId == request.auth.uid'));
  assert.ok(rulesContent.includes("data.mode == 'problem_solve'"));
  assert.ok(rulesContent.includes('data.attachmentName.size() <= 180'));
  assert.ok(rulesContent.includes('data.problemSolve.keys().size() <= 22'));
});
