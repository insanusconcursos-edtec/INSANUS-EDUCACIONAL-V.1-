/**
 * Utilitários para lidar com objetos do Firestore e evitar erros de estrutura circular.
 */

const isFirestoreObject = (obj: any): boolean => {
  if (!obj) return false;
  // Verifica se é Timestamp, FieldValue, DocumentReference, etc based on properties or prototype
  return (
    obj.constructor?.name === 'Timestamp' ||
    obj.constructor?.name === 'FieldValue' ||
    obj.constructor?.name === 'DocumentReference' ||
    obj.constructor?.name === 'Query' ||
    (obj._lat !== undefined && obj._long !== undefined) // GeoPoint
  );
};

/**
 * Converte objetos do Firestore (ou qualquer objeto) em um objeto "Plain" (apenas dados).
 * Transforma Timestamps em strings ISO e remove DocumentReferences ou métodos.
 * Útil para evitar erros de estrutura circular e garantir compatibilidade com JSON.stringify.
 */
export const toPlainObject = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;

  // Se for Date
  if (obj instanceof Date) return obj.toISOString();

  // Se for Timestamp do Firestore (tem toDate())
  if (typeof obj.toDate === 'function') {
    try {
      return obj.toDate().toISOString();
    } catch (e) {
      return String(obj);
    }
  }

  // Se for um DocumentReference ou algo com path (Firebase)
  if (obj.path && typeof obj.path === 'string') {
    return obj.path;
  }

  // Se não for um objeto, retorna o valor primitivo
  if (typeof obj !== 'object') return obj;

  // Se for array, limpa cada item
  if (Array.isArray(obj)) {
    return obj.map(toPlainObject);
  }

  // Se chegar aqui e não for um "Plain Object" (ex: Snapshot, Query), mas tiver dados
  // Tentamos extrair se for um DocumentSnapshot
  if (typeof obj.data === 'function') {
    try {
      const data = obj.data();
      return toPlainObject({ id: obj.id, ...data });
    } catch (e) {
      // Ignora erro se não for snapshot
    }
  }

  // Se for um objeto normal {}
  const plainObj: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      // Ignora funções e campos privados (que começam com _)
      if (typeof val !== 'function' && !key.startsWith('_')) {
        plainObj[key] = toPlainObject(val);
      }
    }
  }
  return plainObj;
};

/**
 * Remove campos 'undefined' de um objeto recursivamente e realiza uma clonagem profunda segura.
 * Preserva objetos especiais do Firestore (Timestamp, FieldValue, DocumentReference) e Dates.
 */
export const sanitizeData = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') return obj;

  // Se for um objeto especial do Firestore ou Date, retorna como está
  if (isFirestoreObject(obj) || obj instanceof Date) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj
      .filter(item => item !== undefined)
      .map(sanitizeData);
  }

  const newObj: any = {};
  Object.keys(obj).forEach(key => {
    if (obj[key] !== undefined) {
      newObj[key] = sanitizeData(obj[key]);
    }
  });
  return newObj;
};

/**
 * Alias para sanitizeData, usado para clonagem profunda segura.
 */
export const deepCloneSafe = <T>(obj: T): T => {
  return sanitizeData(obj) as T;
};
