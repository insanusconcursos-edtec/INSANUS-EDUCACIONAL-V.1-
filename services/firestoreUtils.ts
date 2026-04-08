/**
 * Utilitários para lidar com objetos do Firestore e evitar erros de estrutura circular.
 */

/**
 * Remove campos 'undefined' de um objeto recursivamente e realiza uma clonagem profunda segura.
 * Preserva objetos especiais do Firestore (Timestamp, FieldValue, DocumentReference) e Dates.
 * Evita o erro "Converting circular structure to JSON" que ocorre ao usar JSON.stringify.
 */
export const sanitizeData = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') return obj;

  // Se for um objeto especial do Firestore (Timestamp, FieldValue, etc) ou Date, retorna como está
  // Esses objetos geralmente não são "plain objects" ou têm comportamentos específicos
  if (Object.prototype.toString.call(obj) !== '[object Object]' && !Array.isArray(obj)) {
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
