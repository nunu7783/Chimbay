import { FlappyGame } from './components/FlappyGame';

export default function App() {
  return (
    <div className="min-h-dvh w-full bg-slate-950 text-slate-100 flex flex-col">
      <header className="w-full border-b border-slate-800/80 px-6 py-3 flex items-center justify-between gap-8">
        <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
          Chim Bay
        </span>
        <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
          Trò chơi Arcade trên trình duyệt
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-4">
        <FlappyGame />
      </main>
    </div>
  );
}
