export type ProductType = 'COMBO' | 'PLANO' | 'TURMA_ONLINE' | 'CURSO_ISOLADO' | 'SIMULADO' | 'EVENTO';

export interface LinkedResources {
  plans: string[];
  onlineCourses: string[];
  presentialClasses: string[];
  simulated: string[];
  liveEvents: string[];
}

export interface TictoProduct {
  id?: string;
  name: string;
  tictoId: string;
  type: ProductType;
  accessDays: number;
  coverUrl?: string;
  linkedResources: LinkedResources;
  liveEventIds?: string[]; // IDs dos eventos vinculados diretamente
  createdAt?: any;
  updatedAt?: any;
}
