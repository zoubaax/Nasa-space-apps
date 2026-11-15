import en from './en.json';

/**
 * Base English dictionary (Single Source of Truth).
 * Zero hardcoded foreign language dictionaries in code.
 * All non-English languages (Darija, French, Spanish, etc.) are dynamically
 * translated by AI on the fly based on the map terroir and cached in the client & server.
 */
export const translations = {
  en,
};

export default translations;
