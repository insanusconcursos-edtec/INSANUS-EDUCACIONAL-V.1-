import { Timestamp } from 'firebase/firestore';

export interface ScheduledCall {
  id: string;
  planId: string;
  mentorId: string;
  studentId: string;
  studentName: string;
  studentPhotoUrl: string;
  scheduledAt: Timestamp;
  status: 'scheduled' | 'active' | 'completed';
  roomId: string;
  forceMute?: boolean;
  forceHideCamera?: boolean;
  createdAt: Timestamp;
}

export interface VideoCallSignal {
  type: 'offer' | 'answer' | 'candidate';
  data: any;
  senderId: string;
  createdAt: Timestamp;
}
