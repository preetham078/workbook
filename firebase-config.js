export const firebaseConfig = {
  apiKey: "AIzaSyBVrm9zr6bS8DP5dIw67ItMdYuFgMRGj0w",
  authDomain: "workbook-abb8e.firebaseapp.com",
  projectId: "workbook-abb8e",
  storageBucket: "workbook-abb8e.firebasestorage.app",
  messagingSenderId: "462434137551",
  appId: "1:462434137551:web:ef6b2906a1b429ce634eba",
  measurementId: "G-NDK9E6M53C",
};

export function isFirebaseConfigured(config) {
  return Boolean(
    config?.apiKey &&
      config?.authDomain &&
      config?.projectId &&
      config?.appId &&
      !config.apiKey.includes("YOUR_"),
  );
}
