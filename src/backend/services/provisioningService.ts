import { getAdminConfig } from './firebaseAdmin.js';
import { sendWelcomeEmail, sendAccessNotificationEmail } from './emailService.js';
import crypto from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

interface CustomerData {
  email: string;
  name: string;
  document_number?: string;
  cpf?: string;
  phone?: string | { ddi?: string; ddd?: string; number?: string };
  phone_number?: string;
  cellphone?: string;
  full_phone?: string;
  contact?: {
    phone?: string;
    phone_number?: string;
    cellphone?: string;
  };
}

interface UserAccess {
  id: string;
  type: string;
  targetId: string;
  tictoId: string;
  title: string;
  days: number;
  startDate: Timestamp | FieldValue;
  endDate: Timestamp | FieldValue;
  isActive: boolean;
  resources?: {
    plans?: string[];
    onlineCourses?: string[];
    presentialClasses?: string[];
    simulated?: string[];
    liveEvents?: string[];
  };
  orderIndex?: number;
  revokedAt?: Date;
  sourceProductId?: string; // ID do documento de acesso do Produto que gerou estes sub-recursos
}

interface Resources {
  plans?: string[];
  onlineCourses?: string[];
  presentialClasses?: string[];
  simulated?: string[];
  liveEvents?: string[];
}

export const provisionPurchase = async (customerData: CustomerData, targetId: string, origin: 'ticto' | 'mp' = 'ticto') => {
  const { dbAdmin, authAdmin } = getAdminConfig();
  try {
    const safeTargetId = String(targetId);
    const cpf = customerData.document_number || customerData.cpf || '';
    
    const getPhone = (data: CustomerData) => {
      const p = data.phone || data.phone_number || data.cellphone || data.full_phone || 
                (data.contact && (data.contact.phone || data.contact.phone_number || data.contact.cellphone));
      if (!p) return '';
      if (typeof p === 'object') {
        return `${p.ddi || ''}${p.ddd || ''}${p.number || ''}`.replace(/\D/g, '');
      }
      return String(p).replace(/\D/g, '');
    };
    const phone = getPhone(customerData);

    console.log(`Iniciando provisionamento (${origin}) para: ${customerData.email}`);

    let accessDays = 365;
    let productName = 'Conteúdo Digital';
    let linkedResources: Resources = {
      plans: [],
      onlineCourses: [],
      presentialClasses: [],
      simulated: [],
      liveEvents: []
    };
    let productDocId = '';

    if (origin === 'ticto') {
      const productsSnapshot = await dbAdmin.collection('ticto_products')
        .where('tictoId', '==', safeTargetId)
        .limit(1)
        .get();

      if (productsSnapshot.empty) {
        throw new Error(`Produto Ticto com ID ${safeTargetId} não encontrado.`);
      }

      const productDoc = productsSnapshot.docs[0];
      productDocId = productDoc.id;
      const productData = productDoc.data();
      productName = productData.name;
      accessDays = productData.accessDays || 365;
      linkedResources = productData.linkedResources || linkedResources;
      
      if (productData.liveEventIds && Array.isArray(productData.liveEventIds)) {
        if (!linkedResources.liveEvents) linkedResources.liveEvents = [];
        productData.liveEventIds.forEach((id: string) => {
          if (!linkedResources.liveEvents.includes(id)) linkedResources.liveEvents.push(id);
        });
      }
    } else {
      // Mercado Pago: targetId is usually the ONLINE COURSE ID or a PRODUCT ID
      // Let's assume for now it's a direct course if it's not found in ticto_products (or we can have a generic products collection)
      // For now, let's look in online_courses if it's a courseId
      const courseSnap = await dbAdmin.collection('online_courses').doc(safeTargetId).get();
      if (courseSnap.exists) {
        const courseData = courseSnap.data();
        productName = courseData?.title || 'Curso Online';
        linkedResources.onlineCourses.push(safeTargetId);
      } else {
        // Look if it's a ticto product being sold via MP (reusing the same mapping)
        const productsSnapshot = await dbAdmin.collection('ticto_products').doc(safeTargetId).get();
        if (productsSnapshot.exists) {
          const productData = productsSnapshot.data();
          productName = productData?.name || 'Produto';
          accessDays = productData?.accessDays || 365;
          linkedResources = productData?.linkedResources || linkedResources;
        } else {
          console.warn(`Aviso: Alvo de provisionamento ${safeTargetId} não encontrado em coleções conhecidas.`);
        }
      }
    }

    // Calcular data de expiração
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + accessDays);

    // Preparar array de acessos
    const accessesToGrant: UserAccess[] = [];
    let productAccessId = '';

    // Se for um produto (combo), adiciona o cabeçalho do produto
    if (origin === 'ticto' || productDocId) {
      productAccessId = crypto.randomUUID();
      accessesToGrant.push({
        id: productAccessId,
        type: 'product',
        targetId: productDocId || safeTargetId,
        tictoId: origin === 'ticto' ? safeTargetId : '',
        title: productName,
        days: accessDays,
        startDate: Timestamp.now(),
        endDate: Timestamp.fromDate(expirationDate),
        isActive: true,
        resources: linkedResources
      });
    }

    // ACHATAMENTO (Flattening)
    const resourcesArray: { id: string; type: string }[] = [];
    if (linkedResources.plans) linkedResources.plans.forEach((id: string) => resourcesArray.push({ id, type: 'plan' }));
    if (linkedResources.onlineCourses) linkedResources.onlineCourses.forEach((id: string) => resourcesArray.push({ id, type: 'course' }));
    if (linkedResources.simulated) linkedResources.simulated.forEach((id: string) => resourcesArray.push({ id, type: 'simulated_class' }));
    if (linkedResources.presentialClasses) linkedResources.presentialClasses.forEach((id: string) => resourcesArray.push({ id, type: 'presential_class' }));
    if (linkedResources.liveEvents) linkedResources.liveEvents.forEach((id: string) => resourcesArray.push({ id, type: 'live_event' }));

    for (let index = 0; index < resourcesArray.length; index++) {
      const res = resourcesArray[index];
      let realName = 'Acesso Liberado';
      let collectionName = '';
      
      switch(res.type) {
        case 'course': collectionName = 'online_courses'; break;
        case 'plan': collectionName = 'plans'; break;
        case 'simulated_class': collectionName = 'simulatedClasses'; break;
        case 'presential_class': collectionName = 'classes'; break;
        case 'live_event': collectionName = 'live_events'; break;
      }

      if (collectionName) {
        try {
          const docSnap = await dbAdmin.collection(collectionName).doc(res.id).get();
          if (docSnap.exists) {
            const data = docSnap.data();
            realName = data?.title || data?.name || realName;
          }
        } catch (err) {
          console.error(`Erro ao buscar nome do recurso:`, err);
        }
      }

      accessesToGrant.push({
        id: crypto.randomUUID(),
        targetId: res.id,
        type: res.type,
        title: realName,
        days: accessDays,
        isActive: true,
        tictoId: origin === 'ticto' ? safeTargetId : '',
        startDate: Timestamp.now(),
        endDate: Timestamp.fromDate(expirationDate),
        orderIndex: index,
        sourceProductId: productAccessId // Vincula ao produto pai se existir
      });
    }

    // Lógica de usuário (Novo vs Existente) - REAPROVEITADA
    let userRecord;
    let isNewUser = false;

    try {
      userRecord = await authAdmin.getUserByEmail(customerData.email);
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code === 'auth/user-not-found') isNewUser = true;
      else throw error;
    }

    if (isNewUser) {
      // Gerar senha temporária alfanumérica de 8 caracteres
      const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let generatedPassword = '';
      for (let i = 0; i < 8; i++) {
        generatedPassword += charset.charAt(Math.floor(Math.random() * charset.length));
      }

      userRecord = await authAdmin.createUser({
        email: customerData.email,
        password: generatedPassword,
        displayName: customerData.name,
      });

      const newUserDoc = {
        uid: userRecord.uid,
        name: customerData.name,
        email: customerData.email,
        cpf: cpf,
        contact: phone,
        role: 'student',
        status: 'active',
        createdAt: FieldValue.serverTimestamp(),
        access: accessesToGrant,
      };

      await dbAdmin.collection('users').doc(userRecord.uid).set(newUserDoc);
      await sendWelcomeEmail(customerData.name, customerData.email, generatedPassword, productName);
    } else {
      const userRef = dbAdmin.collection('users').doc(userRecord.uid);
      const userDoc = await userRef.get();
      const userData = userDoc.data() || {};
      
      const updateData: Record<string, any> = { 
        status: 'active',
        access: FieldValue.arrayUnion(...accessesToGrant)
      };
      
      if (!userData.cpf && cpf) updateData.cpf = cpf;
      if (!userData.contact && phone) updateData.contact = phone;

      await userRef.update(updateData);
      await sendAccessNotificationEmail(userData.name || customerData.name, customerData.email, productName);
    }

    return { success: true };
  } catch (error) {
    console.error('Erro no provisionamento geral:', error);
    throw error;
  }
};

export const provisionTictoPurchase = async (customerData: CustomerData, tictoProductId: string) => {
  return provisionPurchase(customerData, tictoProductId, 'ticto');
};

export const revokeTictoPurchase = async (email: string, tictoProductId: string) => {
  const { dbAdmin, authAdmin } = getAdminConfig();
  try {
    const safeProductId = String(tictoProductId);
    // 1. Busca o documento do produto na coleção ticto_products para saber quais recursos ele liberava
    const productsSnapshot = await dbAdmin.collection('ticto_products')
      .where('tictoId', '==', safeProductId)
      .limit(1)
      .get();

    if (productsSnapshot.empty) {
      console.log(`[REVOGAÇÃO] Produto Ticto com ID ${safeProductId} não encontrado.`);
    }

    // 2. Busca o utilizador na coleção users através do e-mail
    let userRecord;
    try {
      userRecord = await authAdmin.getUserByEmail(email);
    } catch (error: unknown) {
      const authError = error as { code: string };
      if (authError.code === 'auth/user-not-found') {
        console.log(`[REVOGAÇÃO] Usuário com e-mail ${email} não encontrado no Auth.`);
        return { success: false, message: 'Usuário não encontrado.' };
      }
      throw error;
    }

    const userRef = dbAdmin.collection('users').doc(userRecord.uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.log(`[REVOGAÇÃO] Documento do usuário ${email} não encontrado no Firestore.`);
      return { success: false, message: 'Documento do usuário não encontrado.' };
    }

    const userData = userDoc.data() || {};
    const currentAccess = (userData.access || []) as UserAccess[];
    // _currentProducts is not used but kept for reference
    // const _currentProducts = userData.products || [];

    // 3. Percorre o array access do utilizador. Para cada item de acesso que corresponda ao produto cancelado, ou que foi gerado por ele, altere a propriedade isActive para false
    let hasChanges = false;
    
    // Primeiro, identificamos o ID do registro de acesso do produto principal
    const productAccessItems = currentAccess.filter(acc => acc.tictoId === safeProductId && acc.type === 'product');
    const productAccessIds = productAccessItems.map(p => p.id);

    const updatedAccess = currentAccess.map((acc: UserAccess) => {
      const isDirectMatch = acc.tictoId === safeProductId;
      const isChildMatch = acc.sourceProductId && productAccessIds.includes(acc.sourceProductId);

      if ((isDirectMatch || isChildMatch) && acc.isActive !== false) {
        hasChanges = true;
        return { ...acc, isActive: false, revokedAt: new Date() };
      }
      return acc;
    });

    if (hasChanges) {
      // 4. Salva o array access atualizado no documento do utilizador
      await userRef.update({ access: updatedAccess });
      console.log(`[REVOGAÇÃO] Acessos revogados para o usuário ${email} referente ao produto ${safeProductId}`);
    } else {
      console.log(`[REVOGAÇÃO] Nenhum acesso ativo encontrado para revogar do usuário ${email} referente ao produto ${safeProductId}`);
    }

    return { success: true, message: 'Revogação concluída com sucesso.' };

  } catch (error) {
    console.error('Erro na revogação:', error);
    throw error;
  }
};
