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

  // --- 開いているメモの状態（パネル） ---
  const [openNote, setOpenNote] = useState(null); // 開いた瞬間の元データ（変更検知の比較用）
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editResult, setEditResult] = useState('memo');
  const [menuOpen, setMenuOpen] = useState(false);      // 右下「⋯」メニュー
  const [confirmDelete, setConfirmDelete] = useState(false); // 削除の確認ダイアログ
  const [saving, setSaving] = useState(false);          // 二重送信よけ

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

  // --- カードをタップしてパネルを開く ---
  const handleOpenNote = (note) => {
    setOpenNote(note);
    setEditTitle(note.title || '');
    setEditContent(note.content || '');
    setEditResult(note.result || 'memo');
    setMenuOpen(false);
    setConfirmDelete(false);
  };

  // --- パネルを閉じる（内部処理。保存はしない） ---
  const resetPanel = () => {
    setOpenNote(null);
    setEditTitle('');
    setEditContent('');
    setEditResult('memo');
    setMenuOpen(false);
    setConfirmDelete(false);
  };

  // --- 閉じる＝保存（Google Keep方式。中身が変わっていなければDBに触らない） ---
  const handleClosePanel = async () => {
    if (!openNote || saving) return;

    const changed =
      editTitle !== (openNote.title || '') ||
      editContent !== (openNote.content || '') ||
      editResult !== (openNote.result || 'memo');

    // 何も変えていないなら通信せずに閉じるだけ
    if (!changed) {
      resetPanel();
      return;
    }

    setSaving(true);
    // ★ .select() を付けて「実際に何行変わったか」を受け取る。
    //    RLSにUPDATE権限が無いと、エラーは出ないのに0行になるため。
    const { data, error } = await supabase
      .from('battle_notes')
      .update({
        title: editTitle,
        content: editContent,
        result: editResult,
      })
      .eq('id', openNote.id) // ★ このIDの行だけを書き換える
      .select();
    setSaving(false);

    if (error) {
      console.error("更新エラー:", error);
      alert('更新できませんでした: ' + error.message);
      return; // パネルは開いたまま（入力内容を失わせない）
    }
    if (!data || data.length === 0) {
      alert('変更が保存されませんでした。\nDBのRLSポリシーにUPDATEの許可が無い可能性があります。');
      return;
    }

    resetPanel();
    fetchNotes();
  };

  // --- 削除（確認ダイアログでOKを押した後に実行される） ---
  const handleDeleteNote = async () => {
    if (!openNote || saving) return;

    setSaving(true);
    const { data, error } = await supabase
      .from('battle_notes')
      .delete()
      .eq('id', openNote.id)
      .select(); // ★ 削除も同じ。0行なら「消えたつもり」の事故になる
    setSaving(false);

    if (error) {
      console.error("削除エラー:", error);
      alert('削除できませんでした: ' + error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert('削除されませんでした。\nDBのRLSポリシーにDELETEの許可が無い可能性があります。');
      return;
    }

    resetPanel();
    fetchNotes();
  };

  // --- パネルを開いている間は背後をスクロールさせない ---
  useEffect(() => {
    if (!openNote) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [openNote]);

  // --- Escキーで閉じる（毎回貼り直して、常に最新の入力内容を見るようにする） ---
  useEffect(() => {
    if (!openNote) return;

    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      // メニューや確認ダイアログが開いていれば、そちらを先に閉じる
      if (confirmDelete) setConfirmDelete(false);
      else if (menuOpen) setMenuOpen(false);
      else handleClosePanel();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

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
          <div
            key={note.id}
            onClick={() => handleOpenNote(note)}
            className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow relative cursor-pointer"
          >
            <h3 className="font-bold mb-2 pr-16">{note.title}</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{note.content}</p>

            <span className={`absolute top-4 right-4 text-xs font-bold px-2 py-1 rounded ${
              note.result === 'win' ? 'bg-blue-100 text-blue-700' :
              note.result === 'lose' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {note.result.toUpperCase()}
            </span>
          </div>
        ))}
      </div>

      {/* ========== 編集パネル（Google Keep方式：タップで開く / 閉じたら保存） ========== */}
      {openNote && (
        <div
          onClick={handleClosePanel} /* 背景をタップしても閉じる＝保存 */
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()} /* パネル内のタップは背景に伝えない */
            className="bg-white w-full sm:max-w-2xl h-[85vh] sm:h-auto sm:max-h-[85vh] rounded-t-2xl sm:rounded-lg shadow-2xl flex flex-col"
          >
            {/* --- 入力エリア（ここが広くなった） --- */}
            <div className="flex-1 overflow-y-auto p-5">
              <input
                type="text"
                placeholder="タイトル"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full text-xl font-bold outline-none mb-4"
              />
              <textarea
                placeholder="バトルメモを入力..."
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full text-base text-gray-700 outline-none resize-none leading-relaxed"
                rows="12"
              ></textarea>
            </div>

            {/* --- 下のバー：タグ選択 ／ ⋯ ／ 閉じる --- */}
            <div className="flex justify-between items-center gap-3 px-5 py-3 border-t border-gray-100">
              <select
                value={editResult}
                onChange={(e) => setEditResult(e.target.value)}
                className="p-2 border rounded text-sm outline-none font-bold text-gray-600 bg-gray-50"
              >
                <option value="memo">MEMO</option>
                <option value="win">WIN</option>
                <option value="lose">LOSE</option>
              </select>

              <div className="flex items-center gap-1">
                {/* ⋯ メニュー */}
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="w-10 h-10 rounded-full text-gray-500 hover:bg-gray-100 transition text-xl leading-none"
                    aria-label="その他の操作"
                  >
                    ⋯
                  </button>

                  {menuOpen && (
                    <div className="absolute bottom-12 right-0 bg-white border border-gray-200 rounded-md shadow-lg py-1 w-36">
                      <button
                        onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition"
                      >
                        削除
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleClosePanel}
                  disabled={saving}
                  className="px-5 py-2 rounded text-sm font-bold text-gray-600 hover:bg-gray-100 transition disabled:opacity-50"
                >
                  {saving ? '保存中...' : '閉じる'}
                </button>
              </div>
            </div>
          </div>

          {/* --- 削除の確認（Keepと違ってゴミ箱が無いので、ここで1枚挟む） --- */}
          {confirmDelete && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="fixed inset-0 z-60 bg-black/40 flex items-center justify-center p-4"
            >
              <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-sm">
                <h3 className="font-bold text-lg mb-2">このメモを削除しますか？</h3>
                <p className="text-sm text-gray-600 mb-6">
                  ゴミ箱はありません。削除すると元に戻せません。
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-4 py-2 rounded text-sm font-bold text-gray-600 hover:bg-gray-100 transition"
                  >
                    やめる
                  </button>
                  <button
                    onClick={handleDeleteNote}
                    disabled={saving}
                    className="bg-red-600 text-white px-5 py-2 rounded text-sm font-bold hover:bg-red-700 transition disabled:opacity-50"
                  >
                    {saving ? '削除中...' : '削除する'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
