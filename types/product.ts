export type ProductType = 'COMBO' | 'PLANO' | 'TURMA_ONLINE' | 'CURSO_ISOLADO' | 'SIMULADO' | 'EVENTO';

export interface LinkedResources {
  plans: string[];
  onlineCourses: string[];
  presentialClasses: string[];
  simulated: string[];
  liveEvents: string[];
}

export interface ProductOffer {
  id: string;
  name: string;
  price: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface TictoProduct {
  id?: string;
  name: string;
  price?: number; // Tornou-se opcional em favor das Offers
  tictoId: string;
  type: ProductType;
  accessDays: number;
  coverUrl?: string;
  linkedResources: LinkedResources;
  offers?: ProductOffer[]; // Novo: Sistema de múltiplas ofertas
  liveEventIds?: string[]; // IDs dos eventos vinculados diretamente
  createdAt?: any;
  updatedAt?: any;
}
