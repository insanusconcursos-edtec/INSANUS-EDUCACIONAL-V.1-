
import React, { createContext, useContext, useState, useCallback } from 'react';
import { SpacedReviewConfigModal } from '../components/student/courses/reviews/SpacedReviewConfigModal';
import { courseReviewService } from '../services/courseReviewService';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

interface SpacedReviewModalContextType {
  openSpacedReviewModal: (params: {
    planId: string;
    disciplineId: string;
    disciplineName: string;
    topicId: string;
    topicName: string;
    isAutoTriggered?: boolean;
    message?: string;
  }) => void;
}

const SpacedReviewModalContext = createContext<SpacedReviewModalContextType | undefined>(undefined);

export const useSpacedReviewModal = () => {
  const context = useContext(SpacedReviewModalContext);
  if (!context) {
    throw new Error('useSpacedReviewModal must be used within a SpacedReviewModalProvider');
  }
  return context;
};

export const SpacedReviewModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [params, setParams] = useState<{
    planId: string;
    disciplineId: string;
    disciplineName: string;
    topicId: string;
    topicName: string;
    isAutoTriggered?: boolean;
    message?: string;
  } | null>(null);

  const openSpacedReviewModal = useCallback((newParams: {
    planId: string;
    disciplineId: string;
    disciplineName: string;
    topicId: string;
    topicName: string;
    isAutoTriggered?: boolean;
    message?: string;
  }) => {
    setParams(newParams);
    setIsOpen(true);
  }, []);

  const handleSave = async (intervals: number[], repeatLast: boolean) => {
    if (!params || !currentUser) return;

    try {
      await courseReviewService.scheduleReviews(
        currentUser.uid,
        null, // courseId
        params.disciplineId,
        params.disciplineName,
        params.topicId,
        params.topicName,
        intervals,
        repeatLast,
        params.planId
      );
      toast.success('Revisões agendadas com sucesso!');
      setIsOpen(false);
    } catch (error) {
      console.error('Erro ao agendar revisões:', error);
      toast.error('Erro ao agendar revisões.');
    }
  };

  return (
    <SpacedReviewModalContext.Provider value={{ openSpacedReviewModal }}>
      {children}
      {isOpen && params && (
        <SpacedReviewConfigModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onSave={handleSave}
          topicName={params.topicName}
          isAutoTriggered={params.isAutoTriggered ?? true}
          customMessage={params.message}
        />
      )}
    </SpacedReviewModalContext.Provider>
  );
};
