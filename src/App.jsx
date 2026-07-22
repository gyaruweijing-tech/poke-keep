import React, { useState, useEffect } from 'react';
import { supabase } from './supabase'; // 神経のインポート

export default function App() {
  // --- 認証用の状態（IDカード関連） ---
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // --- アプリのデータ状態 ---
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [result, setResult] = useState('memo');

  // --- 編集中のメモの状態（どのカードを開いているか＋入力中の値） ---
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editResult, setEditResult] = useState('memo');

  // --- 1. アプリ起動時にIDカード（セッション）を確認 ---
  useEffect(() => {
    // 現在のセッションを取得
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // ログイン・ログアウトの動きを監視（変化があれば自動で切り替わる）
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- 2. セッションがある（ログイン中）時だけデータを取得 ---
  useEffect(() => {
    if (session) {
      fetchNotes();
    } else {
      setNotes([]); // ログアウトしたら画面のデータを消去
    }
  }, [session]);

  // --- 3. 認証機能の関数 ---
  const handleSignUp = async (e) => {
    e.preventDefault();
    if (!email || !password) return alert('メールアドレスとパスワードを入力してください');
    
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert(error.message);
    else alert('登録成功！そのままログインできます。');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return alert('メールアドレスとパスワードを入力してください');
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert('ログイン失敗: ' + error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // --- 4. アプリのデータ処理関数 ---
  const fetchNotes = async () => {
    const { data, error } = await supabase
      .from('battle_notes')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) console.error("データ取得エラー:", error);
    else setNotes(data);
  };

  const handleAddNote = async () => {
    if (!title && !content) return;
    if (!session) return; // 念のためログインチェック

    // Supabaseに投げるデータ
    const newNote = {
      title: title,
      content: content,
      result: result,
      user_id: session.user.id // ★ ここで自分のIDを証明書として一緒に送る！
    };

    // DBにインサート！
    const { error } = await supabase
      .from('battle_notes')
      .insert([newNote]);

    if (error) {
      console.error("追加エラー:", error);
      return;
    }

    // 追加に成功したら再読み込み
    fetchNotes();
    
    // 入力欄を空に戻す
    setTitle('');
    setContent('');
    setResult('memo');
  };

  // --- 編集モードに入る（カードの中身を編集用の入力欄に写す） ---
  const startEdit = (note) => {
    setEditingId(note.id);
    setEditTitle(note.title || '');
    setEditContent(note.content || '');
    setEditResult(note.result || 'memo');
  };

  // --- 編集をやめる（保存せずに閉じる） ---
  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditContent('');
    setEditResult('memo');
  };

  // --- 編集内容をDBに上書き保存（UPDATE） ---
  const handleUpdateNote = async () => {
    if (!editingId) return;

    const { error } = await supabase
      .from('battle_notes')
      .update({
        title: editTitle,
        content: editContent,
        result: editResult,
      })
      .eq('id', editingId); // ★ このIDの行だけを書き換える

    if (error) {
      console.error("更新エラー:", error);
      alert('更新できませんでした: ' + error.message);
      return;
    }

    cancelEdit();
    fetchNotes();
  };

  // ==========================================
  // 画面表示（UI）
  // ==========================================

  // ⛔ ログインしていない場合は「ログイン画面」だけを表示
  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center font-sans text-gray-800 p-4">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 bg-red-600 rounded-full border-4 border-white shadow-md flex items-center justify-center">
              <div className="w-5 h-5 bg-white rounded-full border-2 border-gray-800"></div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center mb-6 tracking-wider">PokeKeep ログイン</h1>
          
          <form className="flex flex-col gap-4">
            <input 
              type="email" 
              placeholder="メールアドレス" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="border border-gray-300 p-3 rounded outline-none focus:border-red-500 transition" 
            />
            <input 
              type="password" 
              placeholder="パスワード (6文字以上)" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="border border-gray-300 p-3 rounded outline-none focus:border-red-500 transition" 
            />
            <div className="flex gap-3 mt-2">
              <button onClick={handleLogin} className="bg-red-600 text-white p-3 rounded w-full font-bold hover:bg-red-700 transition">
                ログイン
              </button>
              <button onClick={handleSignUp} className="bg-gray-200 text-gray-700 p-3 rounded w-full font-bold hover:bg-gray-300 transition">
                新規登録
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // 🟢 ログイン済みの場合は「いつものPokeKeep画面」を表示
  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans text-gray-800">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-red-600 rounded-full border-4 border-white shadow-md flex items-center justify-center">
            <div className="w-4 h-4 bg-white rounded-full border-2 border-gray-800"></div>
          </div>
          <h1 className="text-3xl font-bold tracking-wider">PokeKeep</h1>
        </div>
        
        {/* ログアウトボタンを追加 */}
        <button 
          onClick={handleLogout}
          className="text-sm font-bold text-gray-500 hover:text-gray-800 transition"
        >
          ログアウト
        </button>
      </header>

      <div className="max-w-2xl mx-auto mb-12 bg-white rounded-lg shadow-md p-4">
        <input 
          type="text" 
          placeholder="タイトル" 
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full font-bold outline-none mb-2 text-lg" 
        />
        <textarea 
          placeholder="バトルメモを入力..." 
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full outline-none resize-none mb-4" 
          rows="2"
        ></textarea>
        
        <div className="flex justify-between items-center">
          <select 
            value={result} 
            onChange={(e) => setResult(e.target.value)}
            className="p-1 border rounded text-sm outline-none font-bold text-gray-600 bg-gray-50"
          >
            <option value="memo">MEMO</option>
            <option value="win">WIN</option>
            <option value="lose">LOSE</option>
          </select>
          <button 
            onClick={handleAddNote}
            className="bg-red-600 text-white px-6 py-2 rounded font-bold hover:bg-red-700 transition shadow-sm"
          >
            追加
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {notes.map(note => (
          <div key={note.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow relative">
            {editingId === note.id ? (
              /* ✏️ 編集モード：入力欄に切り替わる */
              <div>
                <input
                  type="text"
                  placeholder="タイトル"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full font-bold outline-none mb-2 border-b border-gray-300 focus:border-red-500 transition"
                />
                <textarea
                  placeholder="バトルメモ"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full text-sm text-gray-600 outline-none resize-none mb-3 border-b border-gray-300 focus:border-red-500 transition"
                  rows="4"
                ></textarea>

                <div className="flex justify-between items-center gap-2">
                  <select
                    value={editResult}
                    onChange={(e) => setEditResult(e.target.value)}
                    className="p-1 border rounded text-xs outline-none font-bold text-gray-600 bg-gray-50"
                  >
                    <option value="memo">MEMO</option>
                    <option value="win">WIN</option>
                    <option value="lose">LOSE</option>
                  </select>

                  <div className="flex gap-2">
                    <button
                      onClick={cancelEdit}
                      className="text-xs font-bold text-gray-500 px-2 py-1 hover:text-gray-800 transition"
                    >
                      やめる
                    </button>
                    <button
                      onClick={handleUpdateNote}
                      className="bg-red-600 text-white text-xs px-4 py-1 rounded font-bold hover:bg-red-700 transition"
                    >
                      保存
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* 📄 通常モード：いつもの表示 */
              <div>
                <h3 className="font-bold mb-2 pr-16">{note.title}</h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{note.content}</p>

                <span className={`absolute top-4 right-4 text-xs font-bold px-2 py-1 rounded ${
                  note.result === 'win' ? 'bg-blue-100 text-blue-700' :
                  note.result === 'lose' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {note.result.toUpperCase()}
                </span>

                <div className="flex justify-end mt-3">
                  <button
                    onClick={() => startEdit(note)}
                    className="text-xs font-bold text-gray-400 hover:text-red-600 transition"
                  >
                    ✏️ 編集
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}