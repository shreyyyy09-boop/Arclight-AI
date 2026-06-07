import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Plus, Save, Trash2, X } from "lucide-react";
import {
  addMemory,
  clearMemories,
  deleteMemory,
  getMemories,
  updateMemory,
  type MemoryItem,
} from "../services/memoryService";
import { resetZoyaSession } from "../services/geminiService";

interface MemoryModalProps {
  onClose: () => void;
}

export default function MemoryModal({ onClose }: MemoryModalProps) {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [newMemory, setNewMemory] = useState("");
  const [editing, setEditing] = useState<Record<string, string>>({});

  const refresh = () => setMemories(getMemories());

  useEffect(() => {
    refresh();
  }, []);

  const handleAdd = () => {
    if (!newMemory.trim()) return;
    addMemory(newMemory, "manual");
    setNewMemory("");
    refresh();
    resetZoyaSession();
  };

  const handleSave = (id: string) => {
    updateMemory(id, editing[id] || "");
    setEditing((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    refresh();
    resetZoyaSession();
  };

  const handleDelete = (id: string) => {
    deleteMemory(id);
    refresh();
    resetZoyaSession();
  };

  const handleClearAll = () => {
    if (!window.confirm("Clear all saved memories?")) return;
    clearMemories();
    setEditing({});
    refresh();
    resetZoyaSession();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-xl p-4"
      >
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.96 }}
          className="w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl border border-white/10 bg-[#101114] shadow-2xl flex flex-col"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/15 text-blue-300 flex items-center justify-center">
                <Brain size={18} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Memory</h2>
                <p className="text-xs text-gray-500">Facts ArcLight can reuse across chats</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="p-4 border-b border-white/10">
            <div className="flex gap-2">
              <input
                value={newMemory}
                onChange={(e) => setNewMemory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
                placeholder="Add a memory..."
                className="flex-1 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-400/50"
              />
              <button
                onClick={handleAdd}
                disabled={!newMemory.trim()}
                className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors"
                title="Add memory"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {memories.length === 0 ? (
              <div className="py-12 text-center">
                <Brain size={28} className="mx-auto text-gray-700 mb-3" />
                <p className="text-sm text-gray-400">No memories yet</p>
                <p className="text-xs text-gray-600 mt-1">Try saying: remember that I like concise answers</p>
              </div>
            ) : (
              memories.map((memory) => {
                const draft = editing[memory.id];
                const isEditing = draft !== undefined;

                return (
                  <div key={memory.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                    {isEditing ? (
                      <textarea
                        value={draft}
                        onChange={(e) => setEditing((current) => ({ ...current, [memory.id]: e.target.value }))}
                        rows={3}
                        className="w-full rounded-lg bg-black/30 border border-blue-400/30 p-2 text-sm text-white outline-none resize-none"
                      />
                    ) : (
                      <p className="text-sm text-gray-200 leading-relaxed">{memory.text}</p>
                    )}

                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-gray-600">
                        {memory.source} - {new Date(memory.updatedAt).toLocaleDateString()}
                      </span>
                      <div className="flex items-center gap-1">
                        {isEditing ? (
                          <button onClick={() => handleSave(memory.id)} className="p-1.5 rounded-lg text-blue-300 hover:bg-blue-500/10" title="Save">
                            <Save size={14} />
                          </button>
                        ) : (
                          <button onClick={() => setEditing((current) => ({ ...current, [memory.id]: memory.text }))} className="px-2 py-1 rounded-lg text-xs text-gray-500 hover:text-white hover:bg-white/5">
                            Edit
                          </button>
                        )}
                        <button onClick={() => handleDelete(memory.id)} className="p-1.5 rounded-lg text-gray-600 hover:text-red-300 hover:bg-red-500/10" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
            <button onClick={handleClearAll} disabled={memories.length === 0} className="text-xs text-gray-500 hover:text-red-300 disabled:opacity-30 disabled:hover:text-gray-500">
              Clear all
            </button>
            <button onClick={onClose} className="rounded-xl bg-white px-5 py-2 text-sm font-medium text-black hover:bg-gray-200 transition-colors">
              Done
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
