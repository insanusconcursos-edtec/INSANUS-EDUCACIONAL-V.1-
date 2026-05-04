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
  isAffiliationEnabled?: boolean; // Novo: Habilita afiliações por oferta
  affiliateCommission?: number; // Novo: Porcentagem de comissão por oferta
  originalPrice?: number; // Novo: Preço de ancoragem
}

export interface ProductSplit {
  id: string;
  productId: string;
  coproducerId: string;
  coproducerName: string;
  coproducerEmail: string;
  percentage: number;
  mpCollectorId: string;
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
  coproduction?: ProductSplit[]; // Novo: Sistema de coprodução/split
  liveEventIds?: string[]; // IDs dos eventos vinculados diretamente
  createdAt?: any;
  updatedAt?: any;
}
