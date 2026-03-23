import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";
import {
  ArrowLeft,
  Globe,
  Home,
  Lock,
  Menu,
  Music,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  SkipBack,
  SkipForward,
  Trash2,
  Unlock,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Song {
  id: string;
  name: string;
  src: string;
  duration?: number;
}

interface PortalMessage {
  id: string;
  text: string;
  timestamp: number;
}

interface Portal {
  id: string;
  name: string;
  messages: PortalMessage[];
  createdAt: number;
}

type View = "home" | "music" | "portals";

// ── LocalStorage ───────────────────────────────────────────────────────────────
const LS_SONGS = "ayan_songs";
const LS_PORTALS = "ayan_portals";

function loadSongs(): Song[] {
  try {
    return JSON.parse(localStorage.getItem(LS_SONGS) || "[]");
  } catch {
    return [];
  }
}
function saveSongs(songs: Song[]) {
  localStorage.setItem(LS_SONGS, JSON.stringify(songs));
}
function loadPortals(): Portal[] {
  try {
    return JSON.parse(localStorage.getItem(LS_PORTALS) || "[]");
  } catch {
    return [];
  }
}
function savePortals(portals: Portal[]) {
  localStorage.setItem(LS_PORTALS, JSON.stringify(portals));
}

// ── Visualizer ─────────────────────────────────────────────────────────────────
function drawVisualizer(
  canvas: HTMLCanvasElement,
  analyser: AnalyserNode,
  animRef: { current: number },
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    animRef.current = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray);
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    const barCount = 48;
    const barWidth = canvas.width / barCount - 1;
    const step = Math.floor(bufferLength / barCount);
    for (let i = 0; i < barCount; i++) {
      const value = dataArray[i * step] / 255;
      const barHeight = value * canvas.height;
      const x = i * (barWidth + 1);
      const y = canvas.height - barHeight;
      const alpha = 0.4 + value * 0.6;
      ctx!.fillStyle = `rgba(29,185,84,${alpha})`;
      ctx!.beginPath();
      ctx!.roundRect(x, y, barWidth, barHeight, 2);
      ctx!.fill();
    }
  }
  draw();
}

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<View>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [songs, setSongs] = useState<Song[]>(loadSongs);
  const [portals, setPortals] = useState<Portal[]>(loadPortals);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPw, setAdminPw] = useState("");
  const [adminError, setAdminError] = useState(false);
  const [currentPortal, setCurrentPortal] = useState<Portal | null>(null);
  const [newPortalName, setNewPortalName] = useState("");
  const [showCreatePortal, setShowCreatePortal] = useState(false);
  const [portalMsg, setPortalMsg] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    saveSongs(songs);
  }, [songs]);
  useEffect(() => {
    savePortals(portals);
  }, [portals]);

  // Sync currentPortal state when portals array changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only re-run when portals list changes
  useEffect(() => {
    if (currentPortal) {
      const updated = portals.find((p) => p.id === currentPortal.id);
      if (updated) setCurrentPortal(updated);
    }
  }, [portals]);

  // Close sidebar on outside click (mobile)
  useEffect(() => {
    if (!sidebarOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("aside") && !target.closest("[data-hamburger]")) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sidebarOpen]);

  const navigate = useCallback((id: View) => {
    setView(id);
    setCurrentPortal(null);
    setSidebarOpen(false); // auto-close on mobile
  }, []);

  const setupAudio = useCallback(
    (song: Song) => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      cancelAnimationFrame(animRef.current);

      const audio = new Audio(song.src);
      audio.volume = volume;
      audioRef.current = audio;

      audio.addEventListener("timeupdate", () =>
        setProgress(audio.currentTime),
      );
      audio.addEventListener("loadedmetadata", () =>
        setDuration(audio.duration),
      );
      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        setProgress(0);
        setSongs((prev) => {
          const idx = prev.findIndex((s) => s.id === song.id);
          if (idx < prev.length - 1) {
            const next = prev[idx + 1];
            setCurrentSong(next);
            setupAudio(next);
            setTimeout(() => {
              audioRef.current?.play();
              setIsPlaying(true);
            }, 50);
          }
          return prev;
        });
      });

      try {
        if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
          audioCtxRef.current = new AudioContext();
        }
        const ctx = audioCtxRef.current;
        try {
          sourceRef.current?.disconnect();
        } catch {
          /* ok */
        }
        const source = ctx.createMediaElementSource(audio);
        sourceRef.current = source;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        if (canvasRef.current)
          drawVisualizer(canvasRef.current, analyser, animRef);
      } catch {
        /* fallback */
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [volume],
  );

  const playSong = useCallback(
    (song: Song) => {
      setCurrentSong(song);
      setProgress(0);
      setupAudio(song);
      setTimeout(() => {
        audioRef.current
          ?.play()
          .then(() => setIsPlaying(true))
          .catch(() => {});
      }, 50);
    },
    [setupAudio],
  );

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioCtxRef.current?.resume();
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  }, [isPlaying]);

  const handleSkip = useCallback(
    (dir: "prev" | "next") => {
      if (!currentSong) return;
      const idx = songs.findIndex((s) => s.id === currentSong.id);
      const newIdx = dir === "next" ? idx + 1 : idx - 1;
      if (newIdx >= 0 && newIdx < songs.length) playSong(songs[newIdx]);
    },
    [currentSong, songs, playSong],
  );

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!audioRef.current || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      audioRef.current.currentTime = ratio * duration;
      setProgress(ratio * duration);
    },
    [duration],
  );

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number.parseFloat(e.target.value);
      setVolume(v);
      if (audioRef.current) audioRef.current.volume = v;
    },
    [],
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      for (const file of files) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const src = ev.target?.result as string;
          const name = file.name.replace(/\.[^.]+$/, "");
          const song: Song = { id: `${Date.now()}${Math.random()}`, name, src };
          setSongs((prev) => {
            const updated = [...prev, song];
            try {
              localStorage.setItem(LS_SONGS, JSON.stringify(updated));
              toast.success(`"${name}" added to library`);
              return updated;
            } catch {
              toast.error("Storage full — song not saved.");
              return prev;
            }
          });
        };
        reader.readAsDataURL(file);
      }
      e.target.value = "";
    },
    [],
  );

  const deleteSong = useCallback(
    (id: string) => {
      setSongs((prev) => prev.filter((s) => s.id !== id));
      if (currentSong?.id === id) {
        setCurrentSong(null);
        setIsPlaying(false);
        audioRef.current?.pause();
      }
      toast.success("Song removed");
    },
    [currentSong],
  );

  const createPortal = useCallback(() => {
    if (!newPortalName.trim()) return;
    const portal: Portal = {
      id: Date.now().toString(),
      name: newPortalName.trim(),
      messages: [],
      createdAt: Date.now(),
    };
    setPortals((prev) => [...prev, portal]);
    setNewPortalName("");
    setShowCreatePortal(false);
    toast.success(`Portal "${portal.name}" created`);
  }, [newPortalName]);

  const deletePortal = useCallback(
    (id: string) => {
      setPortals((prev) => prev.filter((p) => p.id !== id));
      if (currentPortal?.id === id) setCurrentPortal(null);
      toast.success("Portal deleted");
    },
    [currentPortal],
  );

  const sendMessage = useCallback(() => {
    if (!portalMsg.trim() || !currentPortal) return;
    const msg: PortalMessage = {
      id: Date.now().toString(),
      text: portalMsg.trim(),
      timestamp: Date.now(),
    };
    setPortals((prev) =>
      prev.map((p) =>
        p.id === currentPortal.id
          ? { ...p, messages: [...p.messages, msg] }
          : p,
      ),
    );
    setPortalMsg("");
  }, [portalMsg, currentPortal]);

  const handleAdminLogin = useCallback(() => {
    if (adminPw === "ayanbhai07682") {
      setIsAdmin(true);
      setAdminOpen(false);
      setAdminPw("");
      setAdminError(false);
      toast.success("Admin mode activated");
    } else {
      setAdminError(true);
    }
  }, [adminPw]);

  const navItems = [
    { id: "home" as View, label: "Home", icon: Home },
    { id: "music" as View, label: "Music", icon: Music },
    { id: "portals" as View, label: "Portals", icon: Globe },
  ];

  const progressPct = duration ? (progress / duration) * 100 : 0;

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  // ── Sidebar content (shared between desktop & mobile) ──────────────────────
  const SidebarContent = (
    <>
      <div className="px-5 py-6 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-[#1DB954] flex items-center justify-center flex-shrink-0">
          <span className="text-black font-black text-sm">A</span>
        </div>
        <div>
          <div className="text-white font-bold text-sm leading-tight">AYAN</div>
          <div className="text-[#1DB954] font-bold text-[10px] tracking-widest leading-tight">
            MULTIVERSE
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1" data-ocid="nav.section">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            data-ocid={`nav.${id}.link`}
            onClick={() => navigate(id)}
            className={[
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer",
              view === id
                ? "bg-[rgba(29,185,84,0.15)] text-[#1DB954]"
                : "text-[#A7A7A7] hover:bg-[#282828] hover:text-white",
            ].join(" ")}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>

      {isAdmin && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 bg-[rgba(29,185,84,0.12)] border border-[rgba(29,185,84,0.3)] rounded-lg px-3 py-2">
            <Unlock size={13} className="text-[#1DB954]" />
            <span className="text-[#1DB954] text-xs font-bold">Admin Mode</span>
            <button
              type="button"
              data-ocid="admin.logout.button"
              onClick={() => {
                setIsAdmin(false);
                toast.success("Logged out of admin");
              }}
              className="ml-auto text-[#A7A7A7] hover:text-white transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      <div className="p-4 text-[10px] text-[#555] text-center">
        © {new Date().getFullYear()} ·{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[#A7A7A7] transition-colors"
        >
          caffeine.ai
        </a>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#121212]">
      <Toaster theme="dark" />

      {/* ── Desktop Sidebar (hidden on mobile) ─────────────────────────────── */}
      <aside className="hidden md:flex w-[220px] flex-shrink-0 flex-col bg-[#161616] border-r border-[#2B2B2B] z-20">
        {SidebarContent}
      </aside>

      {/* ── Mobile Sidebar overlay ─────────────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* Dark backdrop */}
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 z-30 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            {/* Sidebar panel */}
            <motion.aside
              key="sidebar-panel"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed top-0 left-0 h-full w-[220px] flex flex-col bg-[#161616] border-r border-[#2B2B2B] z-40 md:hidden"
            >
              {/* Close button */}
              <button
                type="button"
                data-ocid="nav.close.button"
                onClick={() => setSidebarOpen(false)}
                className="absolute top-4 right-3 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#282828] text-[#A7A7A7] hover:text-white transition-all"
              >
                <X size={16} />
              </button>
              {SidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main column ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-[60px] flex-shrink-0 flex items-center px-4 md:px-6 gap-3 bg-[#121212] border-b border-[#2B2B2B] sticky top-0 z-10">
          {/* Hamburger — mobile only */}
          <button
            type="button"
            data-hamburger="true"
            data-ocid="nav.command_palette_open"
            onClick={() => setSidebarOpen((v) => !v)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#282828] transition-colors text-[#A7A7A7] hover:text-white flex-shrink-0"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>

          <div className="flex-1 relative max-w-md">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A7A7A7]"
            />
            <input
              data-ocid="search.input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search songs, portals…"
              className="w-full bg-[#232323] border-none outline-none rounded-full pl-9 pr-4 py-2 text-sm text-white placeholder-[#A7A7A7] focus:ring-1 focus:ring-[#1DB954] transition-all"
            />
          </div>
          <button
            type="button"
            data-ocid="admin.open_modal_button"
            onClick={() => setAdminOpen(true)}
            title={isAdmin ? "Admin active" : "Admin login"}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#282828] transition-colors text-[#A7A7A7] hover:text-white flex-shrink-0"
          >
            {isAdmin ? (
              <Unlock size={17} className="text-[#1DB954]" />
            ) : (
              <Lock size={17} />
            )}
          </button>
        </header>

        {/* ── Content area — single keyed child inside AnimatePresence ─────── */}
        <main
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: "80px" }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {view === "home" && (
              <motion.div
                key="home"
                id="homeSection"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22 }}
                className="p-6 space-y-6"
              >
                {/* Hero */}
                <div className="hero-gradient rounded-2xl p-10 relative overflow-hidden">
                  <div
                    className="absolute inset-0 opacity-20"
                    style={{
                      backgroundImage:
                        "radial-gradient(circle at 20% 80%, #1DB954 0%, transparent 50%), radial-gradient(circle at 80% 20%, #6B21A8 0%, transparent 50%)",
                    }}
                  />
                  <div className="relative z-10">
                    <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-[#1DB954] green-glow leading-none mb-3">
                      WELCOME TO THE
                      <br />
                      AYAN MULTIVERSE
                    </h1>
                    <p className="text-[#A7A7A7] text-base mb-6">
                      Explore Music · Connect through Portals
                    </p>
                    <button
                      type="button"
                      data-ocid="home.portals.button"
                      onClick={() => navigate("portals")}
                      className="bg-[#1DB954] text-black font-bold px-6 py-2.5 rounded-full hover:bg-[#1ed760] transition-colors text-sm"
                    >
                      Explore Portals
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    {
                      label: "Songs in Library",
                      value: songs.length,
                      icon: Music,
                      color: "text-[#1DB954]",
                    },
                    {
                      label: "Active Portals",
                      value: portals.length,
                      icon: Globe,
                      color: "text-purple-400",
                    },
                    {
                      label: "Messages Sent",
                      value: portals.reduce((a, p) => a + p.messages.length, 0),
                      icon: Send,
                      color: "text-blue-400",
                    },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div
                      key={label}
                      className="bg-[#1C1C1C] rounded-2xl p-5 border border-[#2B2B2B] hover:border-[#3a3a3a] transition-colors"
                    >
                      <Icon size={22} className={`${color} mb-3`} />
                      <div className="text-3xl font-black text-white">
                        {value}
                      </div>
                      <div className="text-[#A7A7A7] text-xs mt-1">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Recent songs */}
                {songs.length > 0 && (
                  <div>
                    <h2 className="text-white font-bold text-base mb-3">
                      Recently Added
                    </h2>
                    <div className="space-y-1">
                      {songs
                        .slice(-4)
                        .reverse()
                        .map((song, i) => (
                          <button
                            type="button"
                            key={song.id}
                            onClick={() => playSong(song)}
                            className={[
                              "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer transition-all group text-left",
                              currentSong?.id === song.id
                                ? "bg-[rgba(29,185,84,0.12)]"
                                : "hover:bg-[#282828]",
                            ].join(" ")}
                          >
                            <span className="text-[#A7A7A7] text-xs w-4 text-right">
                              {i + 1}
                            </span>
                            <div className="w-8 h-8 bg-[#2B2B2B] rounded-lg flex items-center justify-center flex-shrink-0">
                              <Music
                                size={14}
                                className={
                                  currentSong?.id === song.id
                                    ? "text-[#1DB954]"
                                    : "text-[#A7A7A7]"
                                }
                              />
                            </div>
                            <span
                              className={`text-sm font-medium truncate flex-1 ${
                                currentSong?.id === song.id
                                  ? "text-[#1DB954]"
                                  : "text-white"
                              }`}
                            >
                              {song.name}
                            </span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {view === "music" && (
              <motion.div
                key="music"
                id="musicSection"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22 }}
                className="p-6"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-white font-black text-xl uppercase tracking-wider">
                    Your Library
                  </h2>
                  <button
                    type="button"
                    data-ocid="music.upload_button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 bg-[#1DB954] text-black font-bold px-4 py-2 rounded-full text-sm hover:bg-[#1ed760] transition-colors"
                  >
                    <Upload size={15} />
                    Upload Song
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>

                {songs.length === 0 ? (
                  <div
                    data-ocid="music.empty_state"
                    className="flex flex-col items-center justify-center py-20 text-center"
                  >
                    <Music size={48} className="text-[#2B2B2B] mb-4" />
                    <p className="text-[#A7A7A7] text-sm">
                      No songs yet. Upload your first track!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1" data-ocid="music.list">
                    {songs
                      .filter(
                        (s) =>
                          !searchQuery ||
                          s.name
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase()),
                      )
                      .map((song, i) => (
                        <button
                          type="button"
                          key={song.id}
                          data-ocid={`music.item.${i + 1}`}
                          onClick={() => playSong(song)}
                          className={[
                            "w-full flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all group text-left",
                            currentSong?.id === song.id
                              ? "bg-[rgba(29,185,84,0.12)] border border-[rgba(29,185,84,0.2)]"
                              : "hover:bg-[#282828] border border-transparent",
                          ].join(" ")}
                        >
                          <span className="text-[#A7A7A7] text-xs w-5 text-right flex-shrink-0">
                            {i + 1}
                          </span>
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              currentSong?.id === song.id
                                ? "bg-[#1DB954]"
                                : "bg-[#2B2B2B] group-hover:bg-[#333]"
                            }`}
                          >
                            <Music
                              size={15}
                              className={
                                currentSong?.id === song.id
                                  ? "text-black"
                                  : "text-[#A7A7A7]"
                              }
                            />
                          </div>
                          <span
                            className={`text-sm font-medium truncate flex-1 ${
                              currentSong?.id === song.id
                                ? "text-[#1DB954]"
                                : "text-white"
                            }`}
                          >
                            {song.name}
                          </span>
                          {song.duration && (
                            <span className="text-[#A7A7A7] text-xs flex-shrink-0">
                              {fmtTime(song.duration)}
                            </span>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              data-ocid={`music.delete_button.${i + 1}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSong(song.id);
                              }}
                              className="ml-1 w-7 h-7 flex items-center justify-center rounded-md text-[#A7A7A7] hover:text-red-400 hover:bg-[rgba(239,68,68,0.1)] transition-all flex-shrink-0"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </button>
                      ))}
                  </div>
                )}
              </motion.div>
            )}

            {view === "portals" && (
              <motion.div
                key="portals"
                id="portalSection"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22 }}
                className="p-6"
              >
                {!currentPortal ? (
                  <>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-white font-black text-xl uppercase tracking-wider">
                        Portals
                      </h2>
                      <button
                        type="button"
                        data-ocid="portals.open_modal_button"
                        onClick={() => setShowCreatePortal((v) => !v)}
                        className="flex items-center gap-2 bg-[#1DB954] text-black font-bold px-4 py-2 rounded-full text-sm hover:bg-[#1ed760] transition-colors"
                      >
                        <Plus size={15} />
                        Create Portal
                      </button>
                    </div>

                    <AnimatePresence>
                      {showCreatePortal && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden mb-5"
                        >
                          <div
                            data-ocid="portals.dialog"
                            className="bg-[#1C1C1C] border border-[#2B2B2B] rounded-2xl p-5 flex gap-3"
                          >
                            <input
                              data-ocid="portals.input"
                              value={newPortalName}
                              onChange={(e) => setNewPortalName(e.target.value)}
                              onKeyDown={(e) =>
                                e.key === "Enter" && createPortal()
                              }
                              placeholder="Portal name…"
                              className="flex-1 bg-[#2A2A2A] text-white placeholder-[#A7A7A7] px-4 py-2 rounded-xl outline-none focus:ring-1 focus:ring-[#1DB954] text-sm transition-all"
                            />
                            <button
                              type="button"
                              data-ocid="portals.submit_button"
                              onClick={createPortal}
                              className="bg-[#1DB954] text-black font-bold px-4 py-2 rounded-xl text-sm hover:bg-[#1ed760] transition-colors"
                            >
                              Create
                            </button>
                            <button
                              type="button"
                              data-ocid="portals.cancel_button"
                              onClick={() => setShowCreatePortal(false)}
                              className="px-3 py-2 rounded-xl text-[#A7A7A7] hover:text-white hover:bg-[#2A2A2A] transition-all text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {portals.length === 0 ? (
                      <div
                        data-ocid="portals.empty_state"
                        className="flex flex-col items-center justify-center py-20 text-center"
                      >
                        <Globe size={48} className="text-[#2B2B2B] mb-4" />
                        <p className="text-[#A7A7A7] text-sm">
                          No portals yet. Create your first portal!
                        </p>
                      </div>
                    ) : (
                      <div
                        className="grid grid-cols-2 md:grid-cols-3 gap-4"
                        data-ocid="portals.list"
                      >
                        {portals
                          .filter(
                            (p) =>
                              !searchQuery ||
                              p.name
                                .toLowerCase()
                                .includes(searchQuery.toLowerCase()),
                          )
                          .map((portal, i) => (
                            <motion.button
                              type="button"
                              key={portal.id}
                              data-ocid={`portals.item.${i + 1}`}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setCurrentPortal(portal)}
                              className="bg-[#1C1C1C] border border-[#2B2B2B] hover:border-[rgba(29,185,84,0.3)] rounded-2xl p-5 cursor-pointer transition-all group relative text-left"
                            >
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[rgba(29,185,84,0.3)] to-[rgba(107,33,168,0.3)] flex items-center justify-center mb-3">
                                <Globe size={20} className="text-[#1DB954]" />
                              </div>
                              <h3 className="text-white font-bold text-sm truncate mb-1">
                                {portal.name}
                              </h3>
                              <p className="text-[#A7A7A7] text-xs">
                                {portal.messages.length} message
                                {portal.messages.length !== 1 ? "s" : ""}
                              </p>
                              {isAdmin && (
                                <button
                                  type="button"
                                  data-ocid={`portals.delete_button.${i + 1}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deletePortal(portal.id);
                                  }}
                                  className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-md text-[#A7A7A7] hover:text-red-400 hover:bg-[rgba(239,68,68,0.1)] transition-all opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </motion.button>
                          ))}
                      </div>
                    )}
                  </>
                ) : (
                  /* Portal detail */
                  <motion.div
                    key={`portal-${currentPortal.id}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.22 }}
                    className="flex flex-col h-full"
                  >
                    <div className="flex items-center gap-3 mb-6">
                      <button
                        type="button"
                        data-ocid="portals.back.button"
                        onClick={() => setCurrentPortal(null)}
                        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#282828] text-[#A7A7A7] hover:text-white transition-all"
                      >
                        <ArrowLeft size={18} />
                      </button>
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[rgba(29,185,84,0.3)] to-[rgba(107,33,168,0.3)] flex items-center justify-center">
                        <Globe size={18} className="text-[#1DB954]" />
                      </div>
                      <div>
                        <h2 className="text-white font-bold text-lg leading-tight">
                          {currentPortal.name}
                        </h2>
                        <p className="text-[#A7A7A7] text-xs">
                          {currentPortal.messages.length} messages
                        </p>
                      </div>
                    </div>

                    <div
                      className="flex-1 bg-[#1C1C1C] rounded-2xl border border-[#2B2B2B] flex flex-col"
                      style={{
                        minHeight: 0,
                        maxHeight: "calc(100vh - 280px)",
                      }}
                    >
                      <ScrollArea className="flex-1 p-4">
                        {currentPortal.messages.length === 0 ? (
                          <div
                            data-ocid="portal.messages.empty_state"
                            className="flex flex-col items-center justify-center py-12 text-center"
                          >
                            <Send size={32} className="text-[#2B2B2B] mb-3" />
                            <p className="text-[#A7A7A7] text-sm">
                              No messages yet. Say something!
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {currentPortal.messages.map((msg, i) => (
                              <motion.div
                                key={msg.id}
                                data-ocid={`portal.message.item.${i + 1}`}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-[#242424] rounded-xl px-4 py-3"
                              >
                                <p className="text-white text-sm">{msg.text}</p>
                                <p className="text-[#555] text-xs mt-1">
                                  {new Date(msg.timestamp).toLocaleString()}
                                </p>
                              </motion.div>
                            ))}
                          </div>
                        )}
                      </ScrollArea>

                      <div className="p-4 border-t border-[#2B2B2B] flex gap-3">
                        <input
                          data-ocid="portal.message.input"
                          value={portalMsg}
                          onChange={(e) => setPortalMsg(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                          placeholder="Type a message…"
                          className="flex-1 bg-[#2A2A2A] text-white placeholder-[#A7A7A7] px-4 py-2.5 rounded-xl outline-none focus:ring-1 focus:ring-[#1DB954] text-sm transition-all"
                        />
                        <button
                          type="button"
                          data-ocid="portal.message.submit_button"
                          onClick={sendMessage}
                          className="bg-[#1DB954] text-black font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-[#1ed760] transition-colors flex items-center gap-1.5"
                        >
                          <Send size={15} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* ── Admin modal ────────────────────────────────────────────────────── */}
      <Dialog open={adminOpen} onOpenChange={setAdminOpen}>
        <DialogContent
          data-ocid="admin.dialog"
          className="bg-[#1C1C1C] border-[#2B2B2B] text-white max-w-sm"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Lock size={18} className="text-[#1DB954]" />
              Admin Access
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <input
              data-ocid="admin.input"
              type="password"
              value={adminPw}
              onChange={(e) => {
                setAdminPw(e.target.value);
                setAdminError(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
              placeholder="Enter admin password"
              className="w-full bg-[#2A2A2A] text-white placeholder-[#A7A7A7] px-4 py-2.5 rounded-xl outline-none focus:ring-1 focus:ring-[#1DB954] text-sm transition-all"
            />
            {adminError && (
              <p data-ocid="admin.error_state" className="text-red-400 text-xs">
                Incorrect password. Try again.
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                data-ocid="admin.submit_button"
                onClick={handleAdminLogin}
                className="flex-1 bg-[#1DB954] text-black font-bold py-2.5 rounded-xl text-sm hover:bg-[#1ed760] transition-colors"
              >
                Unlock
              </button>
              <button
                type="button"
                data-ocid="admin.cancel_button"
                onClick={() => {
                  setAdminOpen(false);
                  setAdminPw("");
                  setAdminError(false);
                }}
                className="flex-1 bg-[#2A2A2A] text-white py-2.5 rounded-xl text-sm hover:bg-[#333] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bottom player (fixed) ──────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 h-[80px] player-bar flex items-center px-4 gap-4 z-30"
        data-ocid="player.panel"
      >
        {/* Track info */}
        <div className="flex items-center gap-3 w-[180px] md:w-[220px] flex-shrink-0">
          <div className="w-11 h-11 bg-[#2B2B2B] rounded-lg flex items-center justify-center flex-shrink-0">
            <Music
              size={18}
              className={currentSong ? "text-[#1DB954]" : "text-[#555]"}
            />
          </div>
          <div className="min-w-0 hidden sm:block">
            <div
              className={`text-sm font-semibold truncate ${
                currentSong ? "text-white" : "text-[#555]"
              }`}
            >
              {currentSong?.name || "No song playing"}
            </div>
            {currentSong && (
              <div className="text-[#A7A7A7] text-xs">Ayan Multiverse</div>
            )}
          </div>
        </div>

        {/* Controls + progress */}
        <div className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
          <div className="flex items-center gap-4">
            <button
              type="button"
              data-ocid="player.prev.button"
              onClick={() => handleSkip("prev")}
              disabled={!currentSong}
              className="text-[#A7A7A7] hover:text-white disabled:opacity-30 transition-colors"
            >
              <SkipBack size={18} />
            </button>
            <button
              type="button"
              data-ocid="player.toggle"
              onClick={togglePlay}
              disabled={!currentSong}
              className="w-9 h-9 rounded-full bg-[#1DB954] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isPlaying ? (
                <Pause size={17} className="text-black" />
              ) : (
                <Play size={17} className="text-black ml-0.5" />
              )}
            </button>
            <button
              type="button"
              data-ocid="player.next.button"
              onClick={() => handleSkip("next")}
              disabled={!currentSong}
              className="text-[#A7A7A7] hover:text-white disabled:opacity-30 transition-colors"
            >
              <SkipForward size={18} />
            </button>
          </div>

          <div className="flex items-center gap-2 w-full max-w-md">
            <span className="text-[#A7A7A7] text-[10px] w-8 text-right flex-shrink-0">
              {fmtTime(progress)}
            </span>
            <div
              data-ocid="player.progress.input"
              className="progress-track flex-1"
              role="slider"
              tabIndex={0}
              aria-label="Seek"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              onClick={handleSeek}
              onKeyDown={(e) => {
                if (!audioRef.current || !duration) return;
                if (e.key === "ArrowRight") {
                  audioRef.current.currentTime = Math.min(
                    duration,
                    audioRef.current.currentTime + 5,
                  );
                }
                if (e.key === "ArrowLeft") {
                  audioRef.current.currentTime = Math.max(
                    0,
                    audioRef.current.currentTime - 5,
                  );
                }
              }}
            >
              <div
                className="progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[#A7A7A7] text-[10px] w-8 flex-shrink-0">
              {fmtTime(duration)}
            </span>
          </div>
        </div>

        {/* Visualizer + volume */}
        <div className="hidden sm:flex items-center gap-3 w-[180px] md:w-[220px] flex-shrink-0 justify-end">
          <canvas
            ref={canvasRef}
            width={80}
            height={32}
            className="opacity-80 hidden md:block"
          />
          <Volume2 size={16} className="text-[#A7A7A7] flex-shrink-0" />
          <input
            data-ocid="player.volume.input"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={handleVolumeChange}
            className="w-20 cursor-pointer"
            style={{ accentColor: "#1DB954" }}
          />
        </div>
      </div>
    </div>
  );
}
