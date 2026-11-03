import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Plus, Trash2, ChevronUp, ChevronDown, Settings, Save, X, Volume2, Edit2, Check, LogIn, LogOut } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';

// ==========================================
// 1. Firebaseの設定（※ご自身の情報に書き換えてください）
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

// Firebaseの初期化
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
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // 編集モード用のステート
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  // 読み上げ用の履歴（速度切り替え用）
  const lastSpokenRef = useRef({ text: "", isSlow: false });

  // ------------------------------------------
  // 初期設定とデータ同期
  // ------------------------------------------
  useEffect(() => {
    // Gemini APIキーの読み込み
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setApiKey(savedKey);

    // ログイン状態の監視
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    // ログインしている場合、Firestoreから単語データをリアルタイム取得
    if (user) {
      const q = query(
        collection(db, 'users', user.uid, 'words'),
        orderBy('order', 'desc')
      );
      
      const unsubscribeDb = onSnapshot(q, (snapshot) => {
        const wordsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          // UI用のローカルステート（DBには保存しないが初期値として設定）
          isHidden: true,
          isExampleOpen: false
        }));
        setWords(wordsData);
      });
      return () => unsubscribeDb();
    } else {
      setWords([]);
    }
  }, [user]);

  // ------------------------------------------
  // 認証・設定機能
  // ------------------------------------------
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
      alert("ログインに失敗しました");
    }
  };

  const handleLogout = () => signOut(auth);

  const saveApiKey = () => {
    localStorage.setItem('gemini_api_key', apiKey);
    setShowSettings(false);
  };

  // ------------------------------------------
  // AI生成機能
  // ------------------------------------------
  const generateAIContent = async (wordToTranslate) => {
    if (!apiKey) {
      return {
        japanese: "（※APIキー未設定）" + wordToTranslate + "の意味",
        exampleEnglish: `This is an example for ${wordToTranslate}.`,
        exampleJapanese: `これは ${wordToTranslate} のデモ例文です。`
      };
    }
    try {
      const prompt = `あなたは優秀な英語教師です。以下の英単語の「自然な日本語訳」「日常英会話で使える短い例文」「その例文の自然な日本語訳」をJSON形式で出力してください。
単語: "${wordToTranslate}"
出力形式: {"japanese": "日本語訳", "exampleEnglish": "英文", "exampleJapanese": "例文の日本語訳"}`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { response_mime_type: "application/json" }
        })
      });
      const data = await response.json();
      if (data.candidates && data.candidates[0].content.parts[0].text) {
        return JSON.parse(data.candidates[0].content.parts[0].text);
      }
      throw new Error("Invalid format");
    } catch (error) {
      console.error("API Error:", error);
      alert("翻訳に失敗しました。");
      return null;
    }
  };

  // ------------------------------------------
  // 単語の操作（追加・削除・更新・並び替え）
  // ------------------------------------------
  const handleAddWord = async (e) => {
    e.preventDefault();
    if (!newWord.trim() || isGenerating || !user) return;

    setIsGenerating(true);
    const aiData = await generateAIContent(newWord.trim());
    
    if (aiData) {
      try {
        await addDoc(collection(db, 'users', user.uid, 'words'), {
          english: newWord.trim(),
          japanese: aiData.japanese,
          exampleEnglish: aiData.exampleEnglish,
          exampleJapanese: aiData.exampleJapanese,
          order: Date.now(),
          createdAt: serverTimestamp()
        });
        setNewWord("");
      } catch (error) {
        console.error("Add Error:", error);
      }
    }
    setIsGenerating(false);
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
    }
  };

  const moveWord = async (index, direction) => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === words.length - 1)) return;
    
    const currentWord = words[index];
    const targetWord = words[direction === 'up' ? index - 1 : index + 1];
    
    // orderの値を入れ替える
    await updateDoc(doc(db, 'users', user.uid, 'words', currentWord.id), { order: targetWord.order });
    await updateDoc(doc(db, 'users', user.uid, 'words', targetWord.id), { order: currentWord.order });
  };

  // ------------------------------------------
  // UI補助・音声再生機能
  // ------------------------------------------
  const toggleHidden = (id) => setWords(words.map(w => w.id === id ? { ...w, isHidden: !w.isHidden } : w));
  const toggleExample = (id) => setWords(words.map(w => w.id === id ? { ...w, isExampleOpen: !w.isExampleOpen } : w));

  const startEditing = (word) => {
    setEditingId(word.id);
    setEditForm({ ...word });
  };

  const handleSpeak = (text) => {
    if (!('speechSynthesis' in window)) {
      alert("お使いのブラウザは音声読み上げに対応していません。");
      return;
    }
    window.speechSynthesis.cancel();
    
    let rate = 1.0;
    if (lastSpokenRef.current.text === text && !lastSpokenRef.current.isSlow) {
      rate = 0.6; // 2回目はゆっくり
      lastSpokenRef.current.isSlow = true;
    } else {
      lastSpokenRef.current = { text, isSlow: false };
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
  };

  // ------------------------------------------
  // 未ログイン画面
  // ------------------------------------------
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-sm w-full">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">My単語帳</h1>
          <p className="text-slate-500 mb-8 text-sm">クラウド保存対応・AIアシスト搭載</p>
          <button onClick={handleLogin} className="w-full bg-blue-600 text-white rounded-xl py-3 font-medium hover:bg-blue-700 flex items-center justify-center gap-2">
            <LogIn size={20} />
            Googleでログイン
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------
  // メイン画面
  // ------------------------------------------
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-24">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-800">My単語帳</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSettings(true)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full">
              <Settings size={20} />
            </button>
            <button onClick={handleLogout} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {words.length === 0 && (
          <div className="text-center py-10 text-slate-400">
            単語が登録されていません。<br/>右下の「＋」から追加してください。
          </div>
        )}

        {words.map((word, index) => (
          <div key={word.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
            <div className="p-4 border-b border-slate-100 flex items-start gap-3">
              {/* 並び替えボタン */}
              <div className="flex flex-col items-center justify-center gap-1 mt-1">
                <button onClick={() => moveWord(index, 'up')} disabled={index === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-30 p-1">
                  <ChevronUp size={20} />
                </button>
                <button onClick={() => moveWord(index, 'down')} disabled={index === words.length - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-30 p-1">
                  <ChevronDown size={20} />
                </button>
              </div>

              {/* メインコンテンツ（表示/編集） */}
              <div className="flex-1 min-w-0">
                {editingId === word.id ? (
                  <div className="space-y-2 mb-2 pr-8">
                    <input type="text" value={editForm.english} onChange={(e) => setEditForm({...editForm, english: e.target.value})} className="w-full text-xl font-bold border-b border-blue-300 focus:outline-none" />
                    <textarea value={editForm.japanese} onChange={(e) => setEditForm({...editForm, japanese: e.target.value})} className="w-full text-sm border-b border-blue-300 focus:outline-none" rows={2} />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-1 pr-14">
                      <span className="text-xl font-bold text-slate-800 truncate">{word.english}</span>
                      <button onClick={() => handleSpeak(word.english)} className="text-blue-500 p-1 bg-blue-50 rounded-full hover:bg-blue-100 flex-shrink-0">
                        <Volume2 size={16} />
                      </button>
                    </div>
                    <div className="relative mt-1 pr-8">
                      <div className={`text-base transition-all duration-300 ${word.isHidden ? 'text-transparent select-none' : 'text-slate-600'}`} style={{ textShadow: word.isHidden ? '0 0 12px rgba(15, 23, 42, 0.4)' : 'none' }}>
                        {word.japanese}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* アクションボタン */}
              <div className="absolute right-2 top-2 flex flex-col gap-1">
                {editingId === word.id ? (
                  <button onClick={() => saveEdit(word.id)} className="p-2 text-green-500 hover:bg-green-50 rounded-full"><Check size={18} /></button>
                ) : (
                  <>
                    <button onClick={() => toggleHidden(word.id)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                      {word.isHidden ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                    <button onClick={() => startEditing(word)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><Edit2 size={18} /></button>
                    <button onClick={() => deleteWord(word.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-full"><Trash2 size={18} /></button>
                  </>
                )}
              </div>
            </div>

            {/* 例文アコーディオン */}
            <div className="bg-slate-50/50">
              <button onClick={() => toggleExample(word.id)} className="w-full px-4 py-3 flex items-center justify-between text-sm text-slate-600 font-medium hover:bg-slate-50">
                <span>例文を確認する</span>
                {word.isExampleOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              
              {word.isExampleOpen && (
                <div className="px-4 pb-4 pt-1 space-y-3">
                  {editingId === word.id ? (
                     <div className="space-y-3">
                       <textarea value={editForm.exampleEnglish} onChange={(e) => setEditForm({...editForm, exampleEnglish: e.target.value})} className="w-full text-sm border border-blue-300 rounded p-2 focus:outline-none" rows={2} />
                       <textarea value={editForm.exampleJapanese} onChange={(e) => setEditForm({...editForm, exampleJapanese: e.target.value})} className="w-full text-sm border border-blue-300 rounded p-2 focus:outline-none" rows={2} />
                     </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 text-sm text-slate-700">{word.exampleEnglish}</div>
                        <button onClick={() => handleSpeak(word.exampleEnglish)} className="text-blue-500 p-1.5 bg-blue-50 rounded-full hover:bg-blue-100 flex-shrink-0 mt-0.5"><Volume2 size={14} /></button>
                      </div>
                      <div className={`text-sm transition-all duration-300 ${word.isHidden ? 'text-transparent select-none' : 'text-slate-700'}`} style={{ textShadow: word.isHidden ? '0 0 12px rgba(15, 23, 42, 0.4)' : 'none' }}>
                        {word.exampleJapanese}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </main>

      {/* FAB (Floating Action Button) */}
      <button onClick={() => setIsAddModalOpen(true)} className="fixed right-6 bottom-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 hover:scale-105 transition-all z-20">
        <Plus size={28} />
      </button>

      {/* 単語追加モーダル (Bottom Sheet) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-end z-50">
          <div className="bg-white w-full rounded-t-3xl p-6 shadow-xl relative animate-slide-up max-w-md mx-auto">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-2 bg-slate-100 rounded-full">
              <X size={20} />
            </button>
            <h2 className="text-lg font-bold text-slate-800 mb-4">単語を連続追加</h2>
            <form onSubmit={handleAddWord} className="flex gap-2">
              <input type="text" value={newWord} onChange={(e) => setNewWord(e.target.value)} placeholder="わからない英単語を入力..." className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500" disabled={isGenerating} autoFocus />
              <button type="submit" disabled={isGenerating || !newWord.trim()} className="bg-blue-600 text-white rounded-xl px-4 py-3 font-medium hover:bg-blue-700 disabled:opacity-50">
                {isGenerating ? <span className="block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : <Plus size={20} />}
              </button>
            </form>
            <p className="text-xs text-slate-400 mt-3 text-center">追加後も入力欄は開いたままになります</p>
          </div>
        </div>
      )}

      {/* API Key Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-bold text-slate-800 mb-2">AI設定 (Gemini API)</h2>
            <p className="text-sm text-slate-600 mb-4">Gemini APIキーを入力すると高精度な自動翻訳が有効になります。</p>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AIzaSy..." className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={saveApiKey} className="w-full bg-slate-800 text-white rounded-xl py-3 font-medium hover:bg-slate-700 flex items-center justify-center gap-2">
              <Save size={18} />
              保存して閉じる
            </button>
          </div>
        </div>
      )}

      <style>{`
        .animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );
}