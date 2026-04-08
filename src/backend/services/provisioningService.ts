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
}

export const provisionTictoPurchase = async (customerData: CustomerData, tictoProductId: string) => {
  const { dbAdmin, authAdmin } = getAdminConfig();
  try {
    const safeProductId = String(tictoProductId);
    const cpf = customerData.document_number || customerData.cpf || '';
    
    // Extração robusta do telefone (Contato/WhatsApp)
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

    console.log(`Iniciando provisionamento para: ${customerData.email} (CPF: ${cpf}, Phone: ${phone})`);

    // 1. Procurar na coleção ticto_products qual o produto que possui o tictoId correspondente
    const productsSnapshot = await dbAdmin.collection('ticto_products')
      .where('tictoId', '==', safeProductId)
      .limit(1)
      .get();

    if (productsSnapshot.empty) {
      throw new Error(`Produto Ticto com ID ${safeProductId} não encontrado.`);
    }

    console.log(`Produto encontrado. Criando usuário no Auth...`);
    const productDoc = productsSnapshot.docs[0];
    const productData = productDoc.data() as { 
      name: string; 
      accessDays?: number; 
      linkedResources?: {
        plans?: string[];
        onlineCourses?: string[];
        presentialClasses?: string[];
        simulated?: string[];
        liveEvents?: string[];
      };
      liveEventIds?: string[];
    };
    const accessDays = productData.accessDays || 365;
    const linkedResources = productData.linkedResources || {
      plans: [],
      onlineCourses: [],
      presentialClasses: [],
      simulated: [],
      liveEvents: []
    };
    
    // Merge liveEventIds if present at root
    if (productData.liveEventIds && Array.isArray(productData.liveEventIds)) {
      if (!linkedResources.liveEvents) linkedResources.liveEvents = [];
      productData.liveEventIds.forEach(id => {
        if (!linkedResources.liveEvents!.includes(id)) {
          linkedResources.liveEvents!.push(id);
        }
      });
    }

    // Calcular data de expiração
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + accessDays);

    // 2. Preparar array de acessos (Flattening)
    const accessesToGrant: UserAccess[] = [];

    // Inserir o Produto (Combo)
    const productAccess: UserAccess = {
      id: crypto.randomUUID(),
      type: 'product',
      targetId: productDoc.id,
      tictoId: safeProductId,
      title: productData.name,
      days: accessDays,
      startDate: Timestamp.now(),
      endDate: Timestamp.fromDate(expirationDate),
      isActive: true,
      resources: linkedResources
    };
    accessesToGrant.push(productAccess);

    // Inserir Recursos Vinculados Individualmente (Achatamento)
    let resourcesArray: { id: string; type: string; name?: string; title?: string }[] = [];
    if (Array.isArray(linkedResources)) {
      resourcesArray = linkedResources;
    } else if (linkedResources && typeof linkedResources === 'object') {
      if (linkedResources.plans) linkedResources.plans.forEach((id: string) => resourcesArray.push({ id, type: 'plan' }));
      if (linkedResources.onlineCourses) linkedResources.onlineCourses.forEach((id: string) => resourcesArray.push({ id, type: 'course' }));
      if (linkedResources.simulated) linkedResources.simulated.forEach((id: string) => resourcesArray.push({ id, type: 'simulated_class' }));
      if (linkedResources.presentialClasses) linkedResources.presentialClasses.forEach((id: string) => resourcesArray.push({ id, type: 'presential_class' }));
      if (linkedResources.liveEvents) linkedResources.liveEvents.forEach((id: string) => resourcesArray.push({ id, type: 'live_event' }));
    }

    for (let index = 0; index < resourcesArray.length; index++) {
      const res = resourcesArray[index];
      let mappedType = res.type || 'unknown';
      if (mappedType === 'simulated') mappedType = 'simulated_class';
      if (mappedType === 'presential') mappedType = 'presential_class';

      let realName = res.name || res.title || 'Recurso Vinculado';
      let collectionName = '';
      
      switch(mappedType) {
        case 'course': collectionName = 'online_courses'; break;
        case 'plan': collectionName = 'plans'; break;
        case 'simulated_class': collectionName = 'simulatedClasses'; break;
        case 'presential_class': collectionName = 'classes'; break;
        case 'live_event': collectionName = 'live_events'; break;
      }

      if (collectionName && res.id) {
        try {
          const docSnap = await dbAdmin.collection(collectionName).doc(res.id).get();
          if (docSnap.exists) {
            const data = docSnap.data();
            realName = data?.title || data?.name || realName;
          }
        } catch (error) {
          console.error(`Erro ao buscar nome do recurso ${res.id} na coleção ${collectionName}:`, error);
        }
      }

      accessesToGrant.push({
        id: crypto.randomUUID(),
        targetId: res.id,
        type: mappedType,
        title: realName,
        days: accessDays,
        isActive: true,
        tictoId: safeProductId,
        startDate: Timestamp.now(),
        endDate: Timestamp.fromDate(expirationDate),
        orderIndex: index
      });
    }

    // 3. Verificar se o e-mail do cliente já existe
    let userRecord;
    let isNewUser = false;

    try {
      userRecord = await authAdmin.getUserByEmail(customerData.email);
    } catch (error: unknown) {
      const authError = error as { code: string };
      if (authError.code === 'auth/user-not-found') {
        isNewUser = true;
      } else {
        throw error;
      }
    }

    if (isNewUser) {
      // 3. SE FOR ALUNO NOVO
      // Gerar senha aleatória de 8 caracteres
      const generatePassword = () => {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
        let password = '';
        for (let i = 0; i < 8; i++) {
          password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
      };
      const generatedPassword = generatePassword();

      // Criar usuário no Auth
      userRecord = await authAdmin.createUser({
        email: customerData.email,
        password: generatedPassword,
        displayName: customerData.name,
      });

      // Criar documento na coleção users
      const newUserDoc = {
        uid: userRecord.uid,
        name: customerData.name,
        email: customerData.email,
        cpf: cpf,
        contact: phone,
        whatsapp: phone,
        role: 'student',
        status: 'active',
        createdAt: FieldValue.serverTimestamp(),
        access: accessesToGrant,
        products: accessesToGrant.filter((a: UserAccess) => a.type === 'product')
      };

      await dbAdmin.collection('users').doc(userRecord.uid).set(newUserDoc);

      // Enviar e-mail de boas-vindas real
      console.log(`Usuário criado. Enviando e-mail de boas-vindas...`);
      await sendWelcomeEmail(customerData.name, customerData.email, generatedPassword);
      console.log(`✉️ E-mail de primeiro acesso enviado para ${customerData.email}`);

    } else {
      // 4. SE FOR ALUNO EXISTENTE
      const userRef = dbAdmin.collection('users').doc(userRecord.uid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        // Caso o usuário exista no Auth mas não no Firestore, cria o documento
        const newUserDoc = {
          name: customerData.name || userRecord.displayName || '',
          email: customerData.email,
          cpf: cpf,
          contact: phone || userRecord.phoneNumber || '',
          whatsapp: phone || userRecord.phoneNumber || '',
          role: 'student',
          status: 'active',
          createdAt: FieldValue.serverTimestamp(),
          access: accessesToGrant,
          products: accessesToGrant.filter(a => a.type === 'product')
        };
        await userRef.set(newUserDoc);
      } else {
        // Atualiza o documento adicionando os novos acessos
        const userData = userDoc.data() || {};
        const currentAccess = (userData.access || []) as UserAccess[];

        const updateData: { status: string; cpf?: string; whatsapp?: string; contact?: string; access?: FieldValue; products?: FieldValue } = { status: 'active' };
        
        // Atualização defensiva de CPF e telefone (Contato/WhatsApp)
        if (!userData.cpf && cpf) updateData.cpf = cpf;
        if (!userData.whatsapp && phone) updateData.whatsapp = phone;
        if (!userData.contact && phone) updateData.contact = phone;

        // Verifica se já possui o acesso ativo para não duplicar
        const hasActiveAccess = currentAccess.some((acc: UserAccess) => 
          acc.tictoId === safeProductId && 
          acc.endDate && 
          (acc.endDate as Timestamp).toDate() > new Date()
        );

        if (!hasActiveAccess) {
          updateData.access = FieldValue.arrayUnion(...accessesToGrant);
          updateData.products = FieldValue.arrayUnion(...accessesToGrant.filter(a => a.type === 'product'));
          await userRef.update(updateData);
          console.log(`[PROVISIONAMENTO] Novos acessos adicionados para o usuário existente ${customerData.email}`);
        } else {
          await userRef.update(updateData);
          console.log(`[PROVISIONAMENTO] Usuário ${customerData.email} já possui acesso ativo ao produto ${safeProductId}. Reenviando instruções...`);
        }

        // FORÇAR DISPARO DE E-MAIL MESMO PARA USUÁRIO EXISTENTE
        await sendAccessNotificationEmail(userData.name || customerData.name, customerData.email, productData.name);
        console.log(`✉️ E-mail de reforço enviado para ${customerData.email}`);
      }
    }

    console.log(`Provisionamento concluído com sucesso para ${customerData.email}`);
    return { success: true, message: 'Provisionamento concluído com sucesso.' };

  } catch (error) {
    console.error('Erro no provisionamento:', error);
    throw error;
  }
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

    // 3. Percorre o array access do utilizador. Para cada item de acesso que corresponda ao produto cancelado, altere a propriedade isActive para false
    let hasChanges = false;
    const updatedAccess = currentAccess.map((acc: UserAccess) => {
      if (acc.tictoId === safeProductId && acc.isActive !== false) {
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
