import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchPandaVideoTranscription } from './src/backend/services/pandaVideoService.js';
import { generateStudyMaterial } from './src/backend/services/geminiService.js';
import { getAdminConfig } from './src/backend/services/firebaseAdmin.js';
import { provisionTictoPurchase, revokeTictoPurchase } from './src/backend/services/provisioningService.js';

// const __filename = fileURLToPath(import.meta.url);
// __dirname is not used in this file, but kept for reference if needed
// const __dirname = path.dirname(__filename);

interface PandaFolder {
  id: string;
  name: string;
  title?: string;
  parent_id?: string | null;
  parent_folder_id?: string | null;
  parentId?: string | null;
}

interface PandaVideo {
  id: string;
  video_id?: string;
  title: string;
  name?: string;
  folder_id?: string | null;
  folderId?: string | null;
  video_player_url?: string;
  embed_url?: string;
  length?: number;
}

interface UserAccess {
  type: string;
  targetId: string;
  isActive: boolean;
  id?: string | number;
  endDate?: any;
  startDate?: any;
}

interface StudentProfile {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  userCpf: string;
  userAvatar: string;
  enrollmentType?: string;
  accessOrigin?: string;
  expiresAt?: string | null;
  releasedAt?: string | null;
  active?: boolean;
  createdAt?: any;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware para JSON
  app.use(express.json());

  // Nota: As rotas /api/generate-material, /api/panda-videos, /api/panda-explorer, /api/webhooks/ticto
  // e /api/admin/courses/:courseId/students foram migradas para Vercel Serverless Functions na pasta /api.
  // Elas são mantidas aqui apenas para compatibilidade com o ambiente de desenvolvimento local.

  // Rota de API: /api/generate-material
  app.post('/api/generate-material', async (req, res) => {
    try {
      const { lessonIds, folderTitle } = req.body;

      if (!lessonIds || !Array.isArray(lessonIds) || lessonIds.length === 0) {
        return res.status(400).json({ success: false, error: 'IDs das aulas (lessonIds) são obrigatórios.' });
      }

      if (!folderTitle) {
        return res.status(400).json({ success: false, error: 'folderTitle é obrigatório.' });
      }

      const { dbAdmin } = getAdminConfig();
      const pandaVideoIds: string[] = [];
      
      for (const lessonId of lessonIds) {
        try {
          const snapshot = await dbAdmin.collection('course_contents')
            .where('lessonId', '==', lessonId)
            .get();
          
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.type === 'video' && data.videoPlatform === 'panda' && data.videoUrl) {
              const pandaId = extractPandaId(data.videoUrl);
              if (pandaId && !pandaVideoIds.includes(pandaId)) {
                pandaVideoIds.push(pandaId);
              }
            }
          });
        } catch (err) {
          console.error(`Erro ao buscar conteúdos da aula ${lessonId}:`, err);
        }
      }

      if (pandaVideoIds.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Nenhum vídeo do Panda Video encontrado nas aulas selecionadas.' 
        });
      }

      let fullTranscription = '';
      for (const videoId of pandaVideoIds) {
        try {
          const transcription = await fetchPandaVideoTranscription(videoId);
          fullTranscription += transcription + '\n\n';
        } catch (error) {
          console.error(`Erro ao extrair transcrição do vídeo ${videoId}:`, error);
        }
      }

      if (!fullTranscription.trim()) {
        return res.status(404).json({ 
          success: false, 
          error: 'Não foi possível extrair nenhuma transcrição dos vídeos selecionados.' 
        });
      }

      const generatedText = await generateStudyMaterial(fullTranscription, folderTitle);

      return res.status(200).json({ 
        success: true, 
        markdown: generatedText 
      });

    } catch (error) {
      console.error("Erro na rota de geração de material:", error);
      return res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Erro interno no servidor." 
      });
    }
  });

  // Rota de Listagem de Vídeos do Panda com Busca
  app.get('/api/panda-videos', async (req, res) => {
    try {
      const apiKey = process.env.PANDA_API_KEY;
      const search = req.query.search as string;
      
      let url = 'https://api-v2.pandavideo.com.br/videos?limit=1000';
      if (search) {
        url += `&title=${encodeURIComponent(search)}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': apiKey,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Erro na API do Panda: ${response.status}`);
      }

      const data = await response.json();
      const videos = data.videos || data || [];
      
      // Retorna ID, Título e URL de Embed se disponível
      const cleanVideos = Array.isArray(videos) ? videos.map((v: any) => ({
        id: v.id,
        video_id: v.video_id || v.id,
        panda_id: v.video_id || v.id,
        external_id: v.external_id || null,
        playback_id: v.playback_id || null,
        title: v.title || v.name || 'Sem título',
        video_player_url: v.video_player_url || v.embed_url || null,
        length: v.length || 0,
        folder_id: v.folder_id || v.folderId || null
      })) : [];

      return res.status(200).json({ success: true, videos: cleanVideos });
    } catch (error) {
      console.error("Erro ao listar vídeos do Panda:", error);
      return res.status(500).json({ success: false, error: "Falha ao carregar vídeos do Panda." });
    }
  });

  // Rota de Detalhes de um Vídeo do Panda
  app.get('/api/panda-video-details', async (req, res) => {
    try {
      const apiKey = process.env.PANDA_API_KEY;
      const videoId = req.query.id as string;

      if (!videoId) {
        return res.status(400).json({ success: false, error: "ID do vídeo é obrigatório." });
      }

      const url = `https://api-v2.pandavideo.com.br/videos/${videoId}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': apiKey,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Erro na API do Panda: ${response.status}`);
      }

      const video = await response.json();
      return res.status(200).json({ success: true, video });
    } catch (error) {
      console.error("Erro ao buscar detalhes do vídeo do Panda:", error);
      return res.status(500).json({ success: false, error: "Falha ao carregar detalhes do vídeo do Panda." });
    }
  });

  // Rota de Alunos do Curso (Admin)
  app.get('/api/admin/courses/:courseId/students', async (req, res) => {
    try {
      const { courseId } = req.params;
      const { dbAdmin } = getAdminConfig();

      // 1. Busca Matrículas Diretas (Coleção course_enrollments)
      const directEnrollmentsSnap = await dbAdmin.collection('course_enrollments')
        .where('courseId', '==', courseId)
        .get();
      
      const directEnrollments = directEnrollmentsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // 2. Busca Alunos para verificar acesso via Combo (Coleção users -> array access)
      const studentsSnap = await dbAdmin.collection('users')
        .where('role', '==', 'student')
        .get();

      const studentMap = new Map<string, StudentProfile>();

      // Parte A: Processar alunos que ganharam acesso via Combo/Produto
      studentsSnap.docs.forEach(doc => {
        const userData = doc.data();
        const accessArray: UserAccess[] = userData.access || [];
        
        const courseAccess = accessArray.find((acc: UserAccess) => 
          acc.type === 'course' && 
          acc.targetId === courseId && 
          acc.isActive === true
        );

        if (courseAccess) {
          studentMap.set(doc.id, {
            id: doc.id,
            userId: doc.id,
            userName: userData.name || userData.displayName || 'Sem Nome',
            userEmail: userData.email || '',
            userPhone: userData.phone || userData.whatsapp || userData.contact || '',
            userCpf: userData.cpf || '',
            userAvatar: userData.photoURL || '',
            enrollmentType: (courseAccess.id && String(courseAccess.id).startsWith('mig_')) ? 'MIGRACAO' : 'REGULAR',
            accessOrigin: (courseAccess.id && String(courseAccess.id).startsWith('mig_')) ? 'MIGRATION' : 'COMBO',
            expiresAt: courseAccess.endDate ? (courseAccess.endDate.toDate ? courseAccess.endDate.toDate().toISOString() : courseAccess.endDate) : null,
            releasedAt: courseAccess.startDate ? (courseAccess.startDate.toDate ? courseAccess.startDate.toDate().toISOString() : courseAccess.startDate) : (userData.createdAt?.toDate ? userData.createdAt.toDate().toISOString() : userData.createdAt),
            active: courseAccess.isActive !== false
          });
        }
      });

      // Parte B: Processar Matrículas Diretas
      for (const enrollment of directEnrollments) {
        const userId = (enrollment as { userId?: string }).userId;
        if (!userId) continue;

        let userProfile = studentMap.get(userId);
        
        if (!userProfile) {
          const userDoc = studentsSnap.docs.find(d => d.id === userId);
          if (userDoc) {
            const userData = userDoc.data();
            userProfile = { 
              id: userDoc.id,
              userId: userDoc.id,
              userName: userData.name || userData.displayName || 'Sem Nome',
              userEmail: userData.email || '',
              userPhone: userData.phone || userData.whatsapp || userData.contact || '',
              userCpf: userData.cpf || '',
              userAvatar: userData.photoURL || '',
              createdAt: userData.createdAt
            };
          } else {
            const docRef = await dbAdmin.collection('users').doc(userId).get();
            if (docRef.exists) {
              const userData = docRef.data() || {};
              userProfile = { 
                id: docRef.id,
                userId: docRef.id,
                userName: userData.name || userData.displayName || 'Sem Nome',
                userEmail: userData.email || '',
                userPhone: userData.phone || userData.whatsapp || userData.contact || '',
                userCpf: userData.cpf || '',
                userAvatar: userData.photoURL || '',
                createdAt: userData.createdAt
              };
            }
          }
        }

        if (userProfile) {
          const enrollmentData = enrollment as { 
            enrollmentType?: string; 
            expiresAt?: any; 
            releasedAt?: any; 
            createdAt?: any; 
            active?: boolean; 
          };
          studentMap.set(userId, {
            ...userProfile,
            enrollmentType: enrollmentData.enrollmentType || 'REGULAR',
            accessOrigin: 'DIRECT',
            expiresAt: enrollmentData.expiresAt ? (enrollmentData.expiresAt.toDate ? enrollmentData.expiresAt.toDate().toISOString() : enrollmentData.expiresAt) : null,
            releasedAt: enrollmentData.releasedAt ? (enrollmentData.releasedAt.toDate ? enrollmentData.releasedAt.toDate().toISOString() : enrollmentData.releasedAt) : (enrollmentData.createdAt ? (enrollmentData.createdAt.toDate ? enrollmentData.createdAt.toDate().toISOString() : enrollmentData.createdAt) : (userProfile.createdAt?.toDate ? userProfile.createdAt.toDate().toISOString() : userProfile.createdAt)),
            active: enrollmentData.active !== false
          });
        }
      }

      const aggregatedStudents = Array.from(studentMap.values());

      return res.status(200).json({ success: true, students: aggregatedStudents });
    } catch (error) {
      console.error("Erro ao buscar alunos do curso:", error);
      return res.status(500).json({ success: false, error: "Erro ao buscar alunos." });
    }
  });

  // Rota de Explorer do Panda (Pastas e Vídeos Hierárquicos)
  app.get('/api/panda-explorer', async (req, res) => {
    try {
      const apiKey = process.env.PANDA_API_KEY;
      const folderId = req.query.folderId as string | undefined;

      // URLs para pastas e vídeos
      // Buscamos todas as pastas para filtrar em memória (hierarquia cega)
      // Para vídeos, buscamos com limite alto para garantir que pegamos os da pasta ou da raiz
      const foldersUrl = 'https://api-v2.pandavideo.com.br/folders';
      let videosUrl = 'https://api-v2.pandavideo.com.br/videos?limit=1000';

      // Se tivermos um folderId, podemos tentar otimizar a busca de vídeos na API, 
      // mas manteremos o filtro em memória para garantir a hierarquia correta
      if (folderId && folderId !== 'root' && folderId !== 'null') {
        videosUrl += `&folder_id=${folderId}`;
      }

      const headers = {
        'Authorization': apiKey,
        'Accept': 'application/json'
      };

      // Requisições paralelas
      const [foldersRes, videosRes] = await Promise.all([
        fetch(foldersUrl, { method: 'GET', headers }),
        fetch(videosUrl, { method: 'GET', headers })
      ]);

      if (!foldersRes.ok || !videosRes.ok) {
        throw new Error(`Erro na API do Panda: F:${foldersRes.status} V:${videosRes.status}`);
      }

      const foldersData = await foldersRes.json();
      const videosData = await videosRes.json();

      const foldersArray: PandaFolder[] = foldersData.folders || (Array.isArray(foldersData) ? foldersData : []);
      const videosArray: PandaVideo[] = videosData.videos || (Array.isArray(videosData) ? videosData : []);

      const targetFolderId = req.query.folderId as string | undefined;
      const isRoot = !targetFolderId || targetFolderId === 'root' || targetFolderId === 'null' || targetFolderId === '';

      // Filtro Rigoroso de Hierarquia para Pastas com checagem defensiva de propriedades
      const strictFolders = foldersArray.filter((folder: PandaFolder) => {
        // O Panda pode usar diferentes nomenclaturas. Capturamos todas:
        const parentId = folder.parent_folder_id || folder.parent_id || folder.parentId || null;

        if (isRoot) {
          // Estamos na RAIZ. Só queremos pastas "órfãs" (sem pai)
          return !parentId || parentId === 'null' || parentId === '';
        } else {
          // Estamos dentro de uma pasta. Só queremos as filhas dela
          return String(parentId) === String(targetFolderId);
        }
      });

      // Ordenação alfabética das pastas
      strictFolders.sort((a, b) => (a.name || a.title || '').localeCompare(b.name || b.title || ''));

      const folders = strictFolders.map((f) => ({
        id: f.id,
        name: f.name || f.title || 'Pasta sem nome'
      }));

      // Filtro Rigoroso de Hierarquia para Vídeos
      const strictVideos = videosArray.filter((video: PandaVideo) => {
        const videoFolderId = video.folder_id || video.folderId || null;
        if (isRoot) {
          // Se estamos na RAIZ, só queremos vídeos que NÃO estejam em nenhuma pasta
          return !videoFolderId || videoFolderId === 'null' || videoFolderId === '';
        } else {
          // Se estamos dentro de uma pasta, só queremos os vídeos dela
          return String(videoFolderId) === String(targetFolderId);
        }
      });

      // Ordenação alfabética dos vídeos
      strictVideos.sort((a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || ''));

      const videos = strictVideos.map((v: any) => ({
        id: v.id,
        video_id: v.video_id || v.id,
        panda_id: v.video_id || v.id,
        external_id: v.external_id || null,
        playback_id: v.playback_id || null,
        title: v.title || v.name || 'Sem título',
        video_player_url: v.video_player_url || v.embed_url || null,
        length: v.length || 0,
        folder_id: v.folder_id || v.folderId || null
      }));

      return res.status(200).json({ success: true, folders, videos });
    } catch (error) {
      console.error("Erro no Explorer do Panda:", error);
      return res.status(500).json({ success: false, error: "Falha ao navegar no Panda Video." });
    }
  });

  // Rota de Webhook: /api/webhooks/ticto
  app.post('/api/webhooks/ticto', async (req, res) => {
    try {
      const payload = req.body || {};
      const incomingStatus = payload?.status;
      const incomingProductId = payload?.item?.product_id;
      const incomingToken = payload?.token;

      if (incomingStatus === 'waiting_payment' || incomingProductId === 1 || incomingProductId === '1') {
        return res.status(200).json({ received: true, message: "Teste Ticto Aprovado" });
      }

      const tictoToken = "Zbi2TLCWBPbYJU1Xz14JF7gt8LGm8LQ0tNfMzGcu0US35mR56ye4PFU44We9c5eHcYU6wDzNxNOkx13UDWsVd7FHzI1brmjRrt0i";
      if (incomingToken !== tictoToken) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { status, customer, item } = payload;
      console.log(`Webhook Ticto Recebido - Status: ${status} | Email: ${customer?.email} | Produto ID: ${item?.product_id}`);

      if (status === 'approved' || status === 'paid' || status === 'authorized') {
        await provisionTictoPurchase(customer, String(item.product_id));
      } else if (['refunded', 'chargeback', 'canceled', 'overdue'].includes(status)) {
        await revokeTictoPurchase(customer?.email, String(item.product_id));
      } else {
        console.log(`Status '${status}' ignorado. Nenhuma ação de provisionamento necessária.`);
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      console.error("Webhook Error:", error);
      return res.status(200).json({ received: true, error: "Internal Error" });
    }
  });

  // Função auxiliar extractPandaId
  function extractPandaId(url: string): string | null {
    try {
      if (!url) return null;
      if (!url.includes('http')) return url.split('?v=')[1] || url.split('/embed/')[1] || url.split('/video/')[1] || url;
      
      const urlObj = new URL(url);
      const v = urlObj.searchParams.get('v');
      if (v) return v;

      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      // Se a URL for do tipo .../embed/ID ou .../video/ID
      if (url.includes('/embed/') || url.includes('/video/')) {
        return pathParts[pathParts.length - 1];
      }
      
      return pathParts[pathParts.length - 1] || url;
    } catch (_) {
      return url;
    }
  }

  // Vite middleware para desenvolvimento
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
