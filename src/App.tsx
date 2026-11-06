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

  const [draggedItemIndex, setDraggedItemIndex] = useState(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState(null);
  const [touchPos, setTouchPos] = useState(null);

  const lastSpokenRef = useRef({ text: "", isSlow: false });
  const scrollIntervalRef = useRef(null);

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
      });
      return () => unsubscribeDb();
    } else {
      setWords([]);
    }
  }, [user]);

  useEffect(() => {
    return () => {
      if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    };
  }, []);

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
  // ★ Vercelの裏方APIを使った翻訳＆例文生成（書き換え完了）
  // ------------------------------------------
  const getTranslationAndExample = async (wordToTranslate) => {
    const prompt = `
    あなたは優秀な英語教師です。以下の英単語（または熟語）の「日本語訳」と「実用的で自然な例文」を作成してください。
    対象: "${wordToTranslate}"
    
    以下のJSONフォーマットのみを厳密に出力してください。Markdownの装飾（\`\`\`json など）は一切含めず、純粋なJSON文字列のみを返してください。
    {
      "japanese": "日本語訳",
      "exampleEnglish": "対象の単語を自然に使った英語の実例文",
      "exampleJapanese": "その例文の日本語訳"
    }
    `;

    try {
      // フロントエンドから直接AIを呼ぶのをやめ、自作したVercelの裏方窓口(/api/generate)にお願いする
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt })
      });

      if (!res.ok) {
        throw new Error(`API通信エラー: ${res.status}`);
      }

      // 裏方からAIの結果を受け取る
      const data = await res.json();
      const responseText = data.text;

      // AIがMarkdown（```json ... ```）をつけて返してきた場合に、安全に除去して変換する処理
      const jsonStr = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      const result = JSON.parse(jsonStr);

      return {
        japanese: result.japanese || "翻訳エラー",
        exampleEnglish: result.exampleEnglish || "例文が生成されませんでした",
        exampleJapanese: result.exampleJapanese || ""
      };
    } catch (e) {
      console.error("Translation Error:", e);
      return {
        japanese: "翻訳エラー",
        exampleEnglish: "サーバーとの通信、またはAIの出力形式が不正でした。",
        exampleJapanese: "裏方の通信に失敗しました。"
      };
    }
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
      alert("追加に失敗しました。");
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
      alert("保存に失敗しました。");
    }
  };

  const handleDragEnd = async () => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
    setTouchPos(null);
    
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
      utterance.rate = rate;
      window.speechSynthesis.speak(utterance);
    }, 100);
  };

  // ------------------------------------------
  // 画面描画
  // ------------------------------------------
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm flex flex-col items-center max-w-sm w-full">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">My単語帳</h1>
          <p className="text-slate-500 mb-8 text-sm">クラウド保存・AI自動翻訳搭載</p>
          <button onClick={handleLogin} className="w-full bg-blue-600 text-white rounded-xl py-3 font-medium hover:bg-blue-700 flex items-center justify-center gap-2">
            <LogIn size={20} /> Googleでログイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-24">
      
      {touchPos && draggedItemIndex !== null && words[draggedItemIndex] && (
        <div 
          className="fixed pointer-events-none z-[100] w-[calc(100%-2rem)] max-w-md bg-white rounded-2xl shadow-2xl border-2 border-blue-500 opacity-95 scale-105 p-3 flex items-center gap-3"
          style={{
            left: '50%',
            top: touchPos.y,
            transform: 'translate(-50%, -50%)'
          }}
        >
          <GripVertical size={20} className="text-blue-500" />
          <div className="flex flex-col text-left">
            <span className="text-lg font-bold text-slate-800 leading-tight">{words[draggedItemIndex].english}</span>
          </div>
        </div>
      )}

      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-800">My単語帳</h1>
          <button onClick={handleLogout} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {words.length === 0 && (
          <div className="text-center py-10 text-slate-400">
            単語が登録されていません。<br/>右下の「＋」から追加してください。
          </div>
        )}

        {words.map((word, index) => {
          const isRevealed = revealedIds.includes(word.id);
          const isExpanded = expandedIds.includes(word.id);
          const isDraggingThis = draggedItemIndex === index;
          
          const isHovered = dragOverItemIndex === index && draggedItemIndex !== index;
          const dragDirection = draggedItemIndex !== null && index > draggedItemIndex ? 'down' : 'up';

          if (editingId === word.id) {
            return (
              <div key={word.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-4 text-left">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400">英単語</label>
                    <input type="text" value={editForm.english} onChange={(e) => setEditForm({...editForm, english: e.target.value})} className="w-full text-lg font-bold border-b-2 border-blue-400 focus:outline-none bg-slate-50 px-3 py-2 rounded-t-lg" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400">日本語訳</label>
                    <textarea value={editForm.japanese} onChange={(e) => setEditForm({...editForm, japanese: e.target.value})} className="w-full text-sm border-b-2 border-blue-400 focus:outline-none bg-slate-50 px-3 py-2 rounded-t-lg" rows={2} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400">例文 (英語)</label>
                    <textarea value={editForm.exampleEnglish} onChange={(e) => setEditForm({...editForm, exampleEnglish: e.target.value})} className="w-full text-sm border-b-2 border-blue-400 focus:outline-none bg-slate-50 px-3 py-2 rounded-t-lg" rows={2} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400">例文 (日本語訳)</label>
                    <textarea value={editForm.exampleJapanese} onChange={(e) => setEditForm({...editForm, exampleJapanese: e.target.value})} className="w-full text-sm border-b-2 border-blue-400 focus:outline-none bg-slate-50 px-3 py-2 rounded-t-lg" rows={2} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-slate-100">
                  <button onClick={() => setEditingId(null)} className="px-5 py-2.5 text-sm text-slate-600 bg-slate-100 rounded-xl font-medium hover:bg-slate-200">キャンセル</button>
                  <button onClick={() => saveEdit(word.id)} className="px-5 py-2.5 text-sm text-white bg-blue-600 rounded-xl font-medium hover:bg-blue-700 flex items-center gap-1"><Check size={18}/>保存する</button>
                </div>
              </div>
            );
          }

          return (
            <React.Fragment key={word.id}>
              {isHovered && dragDirection === 'up' && (
                <div className="h-1.5 bg-blue-500 rounded-full my-1 mx-2 shadow-[0_0_8px_#3b82f6] animate-pulse"></div>
              )}

              <div 
                data-index={index}
                className={`word-card bg-white rounded-2xl shadow-sm border overflow-hidden relative transition-all duration-200 ${isDraggingThis ? 'border-dashed border-2 border-slate-300 opacity-40 scale-95 shadow-inner' : 'border-slate-200'}`}
                draggable={editingId === null}
                onDragStart={(e) => {
                  setDraggedItemIndex(index);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnter={() => setDragOverItemIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={handleDragEnd}
              >
                <div className="p-4 border-b border-slate-100 flex items-start gap-3">
                  
                  {editingId !== word.id && (
                    <div 
                      className="flex flex-col items-center justify-center mt-1 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500"
                      style={{ touchAction: 'none' }} 
                      onTouchStart={(e) => {
                        setDraggedItemIndex(index);
                        const touch = e.touches[0];
                        setTouchPos({ x: touch.clientX, y: touch.clientY });
                      }}
                      onTouchMove={(e) => {
                        if (draggedItemIndex === null) return;
                        const touch = e.touches[0];
                        setTouchPos({ x: touch.clientX, y: touch.clientY }); 
                        
                        const edgeThreshold = 80; 
                        const scrollSpeed = 15; 

                        if (touch.clientY < edgeThreshold) {
                          if (!scrollIntervalRef.current) {
                            scrollIntervalRef.current = setInterval(() => window.scrollBy(0, -scrollSpeed), 20);
                          }
                        } else if (window.innerHeight - touch.clientY < edgeThreshold) {
                          if (!scrollIntervalRef.current) {
                            scrollIntervalRef.current = setInterval(() => window.scrollBy(0, scrollSpeed), 20);
                          }
                        } else {
                          if (scrollIntervalRef.current) {
                            clearInterval(scrollIntervalRef.current);
                            scrollIntervalRef.current = null;
                          }
                        }

                        const target = document.elementFromPoint(touch.clientX, touch.clientY);
                        const card = target?.closest('.word-card');
                        if (card) {
                          const hoverIndex = Number(card.dataset.index);
                          if (!isNaN(hoverIndex) && hoverIndex !== dragOverItemIndex) {
                            setDragOverItemIndex(hoverIndex);
                          }
                        }
                      }}
                      onTouchEnd={handleDragEnd}
                    >
                      <GripVertical size={20} />
                    </div>
                  )}

                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2 mb-1 pr-20">
                      <span className="text-xl font-bold text-slate-800 truncate">{word.english}</span>
                      <button onClick={() => handleSpeak(word.english)} className="text-blue-500 p-1 bg-blue-50 rounded-full hover:bg-blue-100 flex-shrink-0"><Volume2 size={16} /></button>
                    </div>
                    
                    <div className="flex items-start gap-2 mt-1 pr-8">
                      <button onClick={() => toggleHidden(word.id)} className="text-slate-400 hover:text-slate-600 p-1 flex-shrink-0 mt-0.5 bg-slate-50 rounded-full">
                        {!isRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <div className={`text-base transition-all duration-300 ${!isRevealed ? 'text-transparent select-none' : 'text-slate-600'}`} style={{ textShadow: !isRevealed ? '0 0 12px rgba(15, 23, 42, 0.4)' : 'none' }}>
                        {word.japanese}
                      </div>
                    </div>
                  </div>

                  <div className="absolute right-2 top-2 flex gap-1">
                    <button onClick={() => startEditing(word)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><Edit2 size={18} /></button>
                    <button onClick={() => deleteWord(word.id)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><Trash2 size={18} /></button>
                  </div>
                </div>

                <div className="bg-slate-50/50">
                  <button onClick={() => toggleExample(word.id)} className="w-full px-4 py-3 flex items-center justify-between text-sm text-slate-600 font-medium hover:bg-slate-50">
                    <span>例文を確認する</span>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 space-y-3 text-left">
                      {word.exampleEnglish && (
                        <div className="flex items-start gap-2">
                          <div className="flex-1 text-sm text-slate-700">{word.exampleEnglish}</div>
                          <button onClick={() => handleSpeak(word.exampleEnglish)} className="text-blue-500 p-1.5 bg-blue-50 rounded-full hover:bg-blue-100 flex-shrink-0 mt-0.5"><Volume2 size={14} /></button>
                        </div>
                      )}
                      <div className={`text-sm transition-all duration-300 ${!isRevealed ? 'text-transparent select-none' : 'text-slate-700'}`} style={{ textShadow: !isRevealed ? '0 0 12px rgba(15, 23, 42, 0.4)' : 'none' }}>
                        {word.exampleJapanese}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {isHovered && dragDirection === 'down' && (
                <div className="h-1.5 bg-blue-500 rounded-full my-1 mx-2 shadow-[0_0_8px_#3b82f6] animate-pulse"></div>
              )}

            </React.Fragment>
          );
        })}
      </main>

      <button onClick={() => setIsAddModalOpen(true)} className="fixed right-6 bottom-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 hover:scale-105 transition-all z-20">
        <Plus size={28} />
      </button>

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

      <style>{`
        .animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );
}
