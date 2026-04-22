
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  Timestamp,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from './firebase';

export type NoteType = 'note' | 'error' | 'questions';

export interface EditalNote {
  id?: string;
  userId: string;
  planId: string;
  editalNodeId: string;
  type: NoteType;
  title: string;
  content: string;
  createdAt?: any;
  updatedAt?: any;
}

const COLLECTION_NAME = 'edital_notes';

export const notebookService = {
  /**
   * Get all notes for a specific topic, user and type
   */
  getNotes: async (userId: string, planId: string, editalNodeId: string, type: NoteType): Promise<EditalNote[]> => {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('userId', '==', userId),
      where('planId', '==', planId),
      where('editalNodeId', '==', editalNodeId),
      where('type', '==', type),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as EditalNote));
  },

  /**
   * Create a new note
   */
  saveNote: async (note: Omit<EditalNote, 'id'>): Promise<string> => {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...note,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return docRef.id;
  },

  /**
   * Update an existing note
   */
  updateNote: async (noteId: string, data: Partial<EditalNote>): Promise<void> => {
    const docRef = doc(db, COLLECTION_NAME, noteId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp()
    });
  },

  /**
   * Delete a note
   */
  deleteNote: async (noteId: string): Promise<void> => {
    const docRef = doc(db, COLLECTION_NAME, noteId);
    await deleteDoc(docRef);
  }
};
