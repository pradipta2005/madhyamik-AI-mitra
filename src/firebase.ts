import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { ChatMessage, LanguageCode, StudySession, WbbseSubject } from './types';
import { clampString, sanitizeMessageForStorage } from './utils/wbbseResearch';

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : ({} as Record<string, string>);
const activeFirebaseConfig = {
  projectId: env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  appId: env.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
  apiKey: env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
  firestoreDatabaseId: env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
  oAuthClientId: env.VITE_FIREBASE_OAUTH_CLIENT_ID || firebaseConfig.oAuthClientId,
};

const app = initializeApp(activeFirebaseConfig);
export const db = getFirestore(app, activeFirebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  return Date.now();
}

export async function ensureUserProfile(
  user: User,
  preferredLang: LanguageCode = 'en'
): Promise<void> {
  const profilePath = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        displayName: clampString(user.displayName || 'Madhyamik Student', 120),
        email: clampString(user.email || 'student@example.com', 200),
        preferredLang,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        displayName: clampString(user.displayName || 'Madhyamik Student', 120),
        preferredLang,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, profilePath);
  }
}

export function subscribeUserSessions(
  userId: string,
  onChange: (sessions: StudySession[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const sessionsPath = `users/${userId}/sessions`;
  const q = query(
    collection(db, 'users', userId, 'sessions'),
    where('userId', '==', userId),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: StudySession[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id ?? d.id),
          userId: String(data.userId ?? userId),
          title: String(data.title ?? 'Untitled Study Session'),
          subject: (data.subject as WbbseSubject) ?? 'All Subjects',
          language: data.language === 'bn' ? 'bn' : 'en',
          messageCount: typeof data.messageCount === 'number' ? data.messageCount : 0,
          hasAttachment: Boolean(data.hasAttachment),
          attachmentName: data.attachmentName ? String(data.attachmentName) : undefined,
          attachmentSummary: data.attachmentSummary
            ? String(data.attachmentSummary)
            : undefined,
          createdAt: toMillis(data.createdAt),
          updatedAt: toMillis(data.updatedAt),
        };
      });
      onChange(items);
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        handleFirestoreError(error, OperationType.LIST, sessionsPath);
      }
    }
  );
}

export function subscribeSessionMessages(
  userId: string,
  sessionId: string,
  onChange: (messages: ChatMessage[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const messagesPath = `users/${userId}/sessions/${sessionId}/messages`;
  const q = query(
    collection(db, 'users', userId, 'sessions', sessionId, 'messages'),
    where('userId', '==', userId),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: ChatMessage[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id ?? d.id),
          sessionId: String(data.sessionId ?? sessionId),
          userId: String(data.userId ?? userId),
          role:
            data.role === 'user' || data.role === 'voice_transcript'
              ? data.role
              : 'assistant',
          text: String(data.text ?? ''),
          language: data.language === 'bn' ? 'bn' : 'en',
          subject: String(data.subject ?? 'All Subjects'),
          mode:
            data.mode === 'pyq' ||
            data.mode === 'concept' ||
            data.mode === 'problem_solve' ||
            data.mode === 'voice'
              ? data.mode
              : 'general',
          attachmentName: data.attachmentName ? String(data.attachmentName) : undefined,
          attachmentMimeType: data.attachmentMimeType
            ? String(data.attachmentMimeType)
            : undefined,
          problemSolve:
            data.problemSolve && typeof data.problemSolve === 'object'
              ? data.problemSolve
              : undefined,
          pyqItems: Array.isArray(data.pyqItems) ? data.pyqItems : undefined,
          youtubeVideos: Array.isArray(data.youtubeVideos)
            ? data.youtubeVideos
            : undefined,
          groundingLinks: Array.isArray(data.groundingLinks)
            ? data.groundingLinks
            : undefined,
          createdAt: toMillis(data.createdAt),
        };
      });
      onChange(items);
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        handleFirestoreError(error, OperationType.LIST, messagesPath);
      }
    }
  );
}

export async function createFirestoreSession(
  userId: string,
  session: StudySession
): Promise<void> {
  const path = `users/${userId}/sessions/${session.id}`;
  try {
    const payload: Record<string, unknown> = {
      id: session.id,
      userId,
      title: clampString(session.title || 'New Study Session', 200),
      subject: session.subject,
      language: session.language,
      messageCount: Math.max(0, Math.min(5000, session.messageCount)),
      hasAttachment: Boolean(session.hasAttachment),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (session.attachmentName) {
      payload.attachmentName = clampString(session.attachmentName, 180);
    }
    if (session.attachmentSummary) {
      payload.attachmentSummary = clampString(session.attachmentSummary, 2000);
    }
    await setDoc(doc(db, 'users', userId, 'sessions', session.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateFirestoreSessionMeta(
  userId: string,
  sessionId: string,
  updates: {
    title?: string;
    subject?: WbbseSubject;
    language?: LanguageCode;
    messageCount?: number;
    hasAttachment?: boolean;
    attachmentName?: string;
    attachmentSummary?: string;
  }
): Promise<void> {
  const path = `users/${userId}/sessions/${sessionId}`;
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.title !== undefined) payload.title = clampString(updates.title, 200);
    if (updates.subject !== undefined) payload.subject = updates.subject;
    if (updates.language !== undefined) payload.language = updates.language;
    if (updates.messageCount !== undefined) {
      payload.messageCount = Math.max(0, Math.min(5000, updates.messageCount));
    }
    if (updates.hasAttachment !== undefined) {
      payload.hasAttachment = Boolean(updates.hasAttachment);
    }
    if (updates.attachmentName !== undefined) {
      payload.attachmentName = clampString(updates.attachmentName, 180);
    }
    if (updates.attachmentSummary !== undefined) {
      payload.attachmentSummary = clampString(updates.attachmentSummary, 2000);
    }

    await updateDoc(doc(db, 'users', userId, 'sessions', sessionId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveFirestoreMessage(
  userId: string,
  sessionId: string,
  rawMsg: ChatMessage
): Promise<void> {
  const msg = sanitizeMessageForStorage(rawMsg);
  const path = `users/${userId}/sessions/${sessionId}/messages/${msg.id}`;
  try {
    const payload: Record<string, unknown> = {
      id: msg.id,
      userId,
      sessionId,
      role: msg.role,
      text: msg.text || '...',
      language: msg.language,
      subject: clampString(msg.subject, 60),
      mode: msg.mode,
      createdAt: serverTimestamp(),
    };
    if (msg.attachmentName) {
      payload.attachmentName = msg.attachmentName;
    }
    if (msg.attachmentMimeType) {
      payload.attachmentMimeType = msg.attachmentMimeType;
    }
    if (msg.problemSolve) {
      payload.problemSolve = msg.problemSolve;
    }
    if (msg.pyqItems && msg.pyqItems.length > 0) {
      payload.pyqItems = msg.pyqItems;
    }
    if (msg.youtubeVideos && msg.youtubeVideos.length > 0) {
      payload.youtubeVideos = msg.youtubeVideos;
    }
    if (msg.groundingLinks && msg.groundingLinks.length > 0) {
      payload.groundingLinks = msg.groundingLinks;
    }

    await setDoc(
      doc(db, 'users', userId, 'sessions', sessionId, 'messages', msg.id),
      payload
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteFirestoreSession(
  userId: string,
  sessionId: string
): Promise<void> {
  const path = `users/${userId}/sessions/${sessionId}`;
  try {
    const msgsRef = collection(db, 'users', userId, 'sessions', sessionId, 'messages');
    const msgsSnap = await getDocs(query(msgsRef, where('userId', '==', userId)));
    const batch = writeBatch(db);
    for (const msgDoc of msgsSnap.docs) {
      batch.delete(msgDoc.ref);
    }
    batch.delete(doc(db, 'users', userId, 'sessions', sessionId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
