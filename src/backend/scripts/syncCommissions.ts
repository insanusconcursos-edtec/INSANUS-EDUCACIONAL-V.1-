
import { getAdminConfig } from '../services/firebaseAdmin.js';
import { getPagarmeOrderStatus } from '../services/pagarmeService.js';
import dotenv from 'dotenv';

dotenv.config();

async function syncLegacyCommissions() {
  console.log('🚀 Iniciando sincronização de dados legados em affiliate_commissions...');
  
  const { dbAdmin } = getAdminConfig();
  
  try {
    const snapshot = await dbAdmin.collection('affiliate_commissions').get();
    const legacyDocs = snapshot.docs.filter(doc => !doc.data().customerEmail);

    console.log(`🔍 Encontrados ${legacyDocs.length} documentos sem dados de cliente.`);

    let successCount = 0;
    let errorCount = 0;

    for (const doc of legacyDocs) {
      const data = doc.data();
      const orderId = data.orderId;

      if (!orderId) {
        console.warn(`⚠️ Doc ${doc.id} não possui orderId. Pulando...`);
        continue;
      }

      try {
        console.log(`📦 Processando Order ID: ${orderId}...`);
        const orderDetails = await getPagarmeOrderStatus(orderId);
        const customer = orderDetails.customer;

        if (customer) {
          const updateData = {
            customerName: customer.name || 'Cliente',
            customerEmail: customer.email || 'N/A',
            customerPhone: customer.phones?.mobile_phone 
              ? `+${customer.phones.mobile_phone.country_code}${customer.phones.mobile_phone.area_code}${customer.phones.mobile_phone.number}`
              : (data.customerPhone || 'N/A')
          };

          await doc.ref.update(updateData);
          console.log(`✅ Sincronizado: ${customer.email}`);
          successCount++;
        } else {
          console.warn(`⚠️ Cliente não encontrado no Pagar.me para a ordem ${orderId}`);
          errorCount++;
        }
      } catch (err) {
        console.error(`❌ Erro ao processar ordem ${orderId}:`, err instanceof Error ? err.message : err);
        errorCount++;
      }
    }

    console.log('\n--- RESULTADO FINAL ---');
    console.log(`Total processado: ${legacyDocs.length}`);
    console.log(`Sucesso: ${successCount}`);
    console.log(`Erros: ${errorCount}`);
    console.log('-----------------------');

  } catch (error) {
    console.error('❌ Erro fatal na migração:', error);
  }
}

syncLegacyCommissions();
