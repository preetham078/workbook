// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBVrm9zr6bS8DP5dIw67ItMdYuFgMRGj0w",
  authDomain: "workbook-abb8e.firebaseapp.com",
  projectId: "workbook-abb8e",
  storageBucket: "workbook-abb8e.firebasestorage.app",
  messagingSenderId: "462434137551",
  appId: "1:462434137551:web:ef6b2906a1b429ce634eba",
  measurementId: "G-NDK9E6M53C"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);