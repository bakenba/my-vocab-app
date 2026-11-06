import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Plus, Trash2, ChevronUp, ChevronDown, X, Volume2, Edit2, Check, LogIn, LogOut, GripVertical } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';

// ==========================================
// 1. Firebaseの設定
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyCsPAQ7HSnDGNjBE4pqdYhk4YJkVOS5wZU",
  authDomain: "smartvocab-d09d2.firebaseapp.com",
  projectId: "smartvocab-d09d2",
  storageBucket: "smartvocab-d09d2.firebasestorage.app",
  messagingSenderId: "892434677199",
  appId: "1:892434677199:web:8ceee337eb86cd75e6a6ba",
  measurementId: "G-2CSDYYGX6Q"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// 2. メインアプリコンポーネント
// ==========================================
export default function App() {
  const [user, setUser] = useState(null);
  const [words, setWords] = useState([]);
  const [newWord, setNewWord] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  const [revealedIds, setRevealedIds] = useState([]);
  const [expandedIds, setExpandedIds] = useState([]);
  
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  // ドラッグ＆ドロップ用のステート
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState(null);
  const [touchPos, setTouchPos] = useState(null); // スマホで指を追従するカードの座標

  const lastSpokenRef = useRef({ text: "", isSlow: false });

  // ------------------------------------------
  // 初期設定とデータ同期
  // ------------------------------------------
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (user) {
      const q = query(collection(db, 'users', user.uid, 'words'));
      const unsubscribeDb = onSnapshot(q, (snapshot) => {
        const wordsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        wordsData.sort((a, b) => (b.order || 0) - (a.order || 0));
        setWords(wordsData);
      }, (error) => {
        console.error("Firestore Error:", error);
      });
      return () => unsubscribeDb();
    } else {
      setWords([]);
    }
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      alert("ログインに失敗しました");
    }
  };

  const handleLogout = () => signOut(auth);

  // ------------------------------------------
  // 翻訳＆例文取得ロジック
  // ------------------------------------------
  const getTranslationAndExample = async (wordToTranslate) => {
    let exampleEn = "";
    try {
      const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(wordToTranslate)}`);
      if (dictRes.ok) {
        const dictData = await dictRes.json();
        const meanings = dictData[0]?.meanings || [];
        for (const meaning of meanings) {
          const defs = meaning.definitions || [];
          for (const def of defs) {
            if (def.example) {
              exampleEn = def.example;
              break;
            }
          }
          if (exampleEn) break;
        }
      }
    } catch (err) {
      console.warn(err);
    }

    if (!exampleEn) {
      exampleEn = `This is a sentence using the word "${wordToTranslate}".`;
    }

    const translateText = async (text) => {
      try {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ja`);
        if (!res.ok) return text;
        const data = await res.json();
        return data.responseData?.translatedText || text;
      } catch (err) {
        return "翻訳エラー";
      }
    };

    const translatedWord = await translateText(wordToTranslate);
    const translatedExample = await translateText(exampleEn);

    return {
      japanese: translatedWord,
      exampleEnglish: exampleEn,
      exampleJapanese: translatedExample
    };
  };

  // ------------------------------------------
  // 単語の追加・削除・更新・並び替え
  // ------------------------------------------
  const handleAddWord = async (e) => {
    e.preventDefault();
    const wordText = newWord.trim();
    if (!wordText || isGenerating || !user) return;

    setIsGenerating(true);

    try {
      const translationData = await getTranslationAndExample(wordText);
      
      setNewWord("");
      setIsGenerating(false);
      
      await addDoc(collection(db, 'users', user.uid, 'words'), {
        english: wordText,
        japanese: translationData.japanese,
        exampleEnglish: translationData.exampleEnglish,
        exampleJapanese: translationData.exampleJapanese,
        order: Date.now(),
        createdAt: serverTimestamp()
      });
      
    } catch (error) {
      console.error("Add Error:", error);
      alert("追加に失敗しました。Firebaseのルール設定を確認してください。");
      setIsGenerating(false);
    }
  };

  const deleteWord = async (id) => {
    if(window.confirm("この単語を削除しますか？")) {
      await deleteDoc(doc(db, 'users', user.uid, 'words', id));
    }
  };

  const saveEdit = async (id) => {
    try {
      await updateDoc(doc(db, 'users', user.uid, 'words', id), {
        english: editForm.english,
        japanese: editForm.japanese,
        exampleEnglish: editForm.exampleEnglish,
        exampleJapanese: editForm.exampleJapanese,
      });
      setEditingId(null);
    } catch (error) {
      console.error("Update Error:", error);
      alert("保存に失敗しました。Firebaseのルール設定を確認してください。");
    }
  };

  const handleDragEnd = async () => {
    setTouchPos(null); // 指を離したら追従用カードを消す
    
    if (draggedItemIndex === null || dragOverItemIndex === null || draggedItemIndex === dragOverItemIndex) {
      setDraggedItemIndex(null);
      setDragOverItemIndex(null);
      return;
    }

    const newWords = [...words];
    const draggedItem = newWords[draggedItemIndex];
    newWords.splice(draggedItemIndex, 1);
    newWords.splice(dragOverItemIndex, 0, draggedItem);

    setWords(newWords);

    const batch = writeBatch(db);
    const now = Date.now();

    newWords.forEach((word, index) => {
      const wordRef = doc(db, 'users', user.uid, 'words', word.id);
      batch.update(wordRef, { order: now - index * 1000 });
    });

    try {
      await batch.commit();
    } catch (error) {
      console.error("並び替えエラー:", error);
    }

    setDraggedItemIndex(null);
    setDragOverItemIndex(null);
  };

  // ------------------------------------------
  // UI補助機能
  // ------------------------------------------
  const toggleHidden = (id) => {
    setRevealedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleExample = (id) => {
    setExpandedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const startEditing = (word) => {
    setEditingId(word.id);
    setEditForm({ ...word });
  };

  const handleSpeak = (text) => {
    if (!('speechSynthesis' in window)) return;
    
    window.speechSynthesis.cancel();
    
    let rate = 1.0;
    if (lastSpokenRef.current.text === text && !lastSpokenRef.current.isSlow) {
      rate = 0.5; 
      lastSpokenRef.current.isSlow = true;
    } else {
      lastSpokenRef.current = { text, isSlow: false };
    }

    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utter
